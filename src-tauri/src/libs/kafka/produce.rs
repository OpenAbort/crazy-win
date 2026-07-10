use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

use rskafka::chrono::{TimeZone, Utc};
use rskafka::client::partition::{Compression, UnknownTopicHandling};
use rskafka::record::Record;

use super::admin::KafkaAdmin;

pub struct KafkaProducer;

impl KafkaProducer {
    /// Produces a single record to an explicit partition (rskafka has no
    /// built-in key-based partitioner, so the caller must choose one) and
    /// returns the offset it was written at.
    pub async fn produce(
        brokers: &str,
        topic: &str,
        partition: i32,
        key: Option<String>,
        value: Option<String>,
        headers: Vec<(String, String)>,
    ) -> Result<i64, String> {
        let client = KafkaAdmin::client(brokers).await?;
        let partition_client = client
            .partition_client(topic, partition, UnknownTopicHandling::Error)
            .await
            .map_err(|e| e.to_string())?;

        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_millis() as i64;

        let record = Record {
            key: key.map(|k| k.into_bytes()),
            value: value.map(|v| v.into_bytes()),
            headers: headers.into_iter().map(|(k, v)| (k, v.into_bytes())).collect::<BTreeMap<_, _>>(),
            timestamp: Utc.timestamp_millis_opt(now_ms).single().ok_or("Invalid timestamp.")?,
        };

        let offsets = partition_client
            .produce(vec![record], Compression::NoCompression)
            .await
            .map_err(|e| e.to_string())?;

        offsets.into_iter().next().ok_or_else(|| "No offset returned.".to_string())
    }
}
