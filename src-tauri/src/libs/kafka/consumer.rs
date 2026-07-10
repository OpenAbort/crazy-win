use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use futures::StreamExt;
use rskafka::client::consumer::{StartOffset, StreamConsumerBuilder};
use rskafka::client::partition::UnknownTopicHandling;
use tauri::Emitter;
use tokio::sync::Notify;

use super::admin::KafkaAdmin;
use super::types::KafkaMessage;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct KafkaMessagePayload {
    stream_id: u64,
    topic: String,
    message: KafkaMessage,
}

/// Tracks in-flight consume streams so `stop` can cancel every per-partition
/// task belonging to a given `stream_id` with one call.
#[derive(Default)]
pub struct KafkaConsumeStreams {
    next_id: AtomicU64,
    cancels: Mutex<HashMap<u64, Arc<Notify>>>,
}

impl KafkaConsumeStreams {
    pub fn next_id(&self) -> u64 {
        self.next_id.fetch_add(1, Ordering::SeqCst)
    }

    fn register(&self, id: u64, cancel: Arc<Notify>) {
        self.cancels.lock().unwrap().insert(id, cancel);
    }

    pub fn stop(&self, id: u64) {
        if let Some(cancel) = self.cancels.lock().unwrap().remove(&id) {
            cancel.notify_waiters();
        }
    }
}

pub async fn start_stream(
    brokers: String,
    topic: String,
    partitions: Vec<i32>,
    app: tauri::AppHandle,
    stream_id: u64,
    streams: &KafkaConsumeStreams,
) -> Result<(), String> {
    let client = Arc::new(KafkaAdmin::client(&brokers).await?);

    let target_partitions = if partitions.is_empty() {
        KafkaAdmin::list_topics(&brokers)
            .await?
            .into_iter()
            .find(|t| t.name == topic)
            .map(|t| t.partitions)
            .unwrap_or_default()
    } else {
        partitions
    };
    if target_partitions.is_empty() {
        return Err(format!("Topic \"{topic}\" has no partitions to consume."));
    }

    let cancel = Arc::new(Notify::new());
    streams.register(stream_id, cancel.clone());
    let remaining = Arc::new(AtomicUsize::new(target_partitions.len()));

    for partition in target_partitions {
        let client = client.clone();
        let app = app.clone();
        let topic = topic.clone();
        let cancel = cancel.clone();
        let remaining = remaining.clone();

        tauri::async_runtime::spawn(async move {
            run_partition_consumer(client, app.clone(), topic, partition, stream_id, cancel).await;
            if remaining.fetch_sub(1, Ordering::SeqCst) == 1 {
                let _ = app.emit("kafka-stream-closed", stream_id);
            }
        });
    }

    Ok(())
}

async fn run_partition_consumer(
    client: Arc<rskafka::client::Client>,
    app: tauri::AppHandle,
    topic: String,
    partition: i32,
    stream_id: u64,
    cancel: Arc<Notify>,
) {
    let partition_client = match client
        .partition_client(topic.clone(), partition, UnknownTopicHandling::Error)
        .await
    {
        Ok(pc) => Arc::new(pc),
        Err(e) => {
            let _ = app.emit("kafka-stream-error", format!("{e}"));
            return;
        }
    };

    let mut stream = StreamConsumerBuilder::new(partition_client, StartOffset::Latest).build();

    loop {
        tokio::select! {
            _ = cancel.notified() => break,
            next = stream.next() => {
                match next {
                    Some(Ok((record_and_offset, _high_watermark))) => {
                        let record = record_and_offset.record;
                        let message = KafkaMessage {
                            partition,
                            offset: record_and_offset.offset,
                            timestamp_ms: record.timestamp.timestamp_millis(),
                            key: record.key.map(|b| String::from_utf8_lossy(&b).into_owned()),
                            value: record.value.map(|b| String::from_utf8_lossy(&b).into_owned()),
                            headers: record
                                .headers
                                .into_iter()
                                .map(|(k, v)| (k, String::from_utf8_lossy(&v).into_owned()))
                                .collect(),
                        };
                        let _ = app.emit(
                            "kafka-message",
                            KafkaMessagePayload { stream_id, topic: topic.clone(), message },
                        );
                    }
                    Some(Err(_)) | None => break,
                }
            }
        }
    }
}
