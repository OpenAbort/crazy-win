use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

use futures::future::try_join_all;
use rskafka::client::partition::{OffsetAt, UnknownTopicHandling};
use rskafka::client::{Client, ClientBuilder};

use super::types::{parse_brokers, TopicSummary};

const ADMIN_TIMEOUT_MS: i32 = 5_000;

/// `ClientBuilder::build()` performs a full metadata bootstrap (connect to
/// every bootstrap broker, discover the cluster) — a real network round trip.
/// Doing that on every single topic list / produce / consume call made every
/// action pay that cost, and if the bootstrap needed even one retry it could
/// balloon into several seconds thanks to rskafka's exponential backoff
/// (100ms * 3^n). Caching one `Client` per bootstrap string means that cost
/// is paid once, not on every click.
fn client_cache() -> &'static Mutex<HashMap<String, Arc<Client>>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Arc<Client>>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub struct KafkaAdmin;

impl KafkaAdmin {
    pub(crate) async fn client(brokers: &str) -> Result<Arc<Client>, String> {
        if let Some(existing) = client_cache().lock().unwrap().get(brokers) {
            return Ok(existing.clone());
        }

        let bootstrap = parse_brokers(brokers);
        if bootstrap.is_empty() {
            return Err("No brokers configured.".to_string());
        }
        let client = Arc::new(ClientBuilder::new(bootstrap).build().await.map_err(|e| e.to_string())?);
        client_cache().lock().unwrap().insert(brokers.to_string(), client.clone());
        Ok(client)
    }

    /// Evicts the cached client for `brokers`, if any. Must be called whenever
    /// the broker behind that address is torn down/recreated (stop/reset),
    /// otherwise a stale cached client would keep talking to a dead cluster.
    pub fn invalidate_client(brokers: &str) {
        client_cache().lock().unwrap().remove(brokers);
    }

    pub async fn list_topics(brokers: &str) -> Result<Vec<TopicSummary>, String> {
        let client = Self::client(brokers).await?;
        let topics = client.list_topics().await.map_err(|e| e.to_string())?;
        Ok(topics
            .into_iter()
            .map(|t| TopicSummary {
                name: t.name,
                partition_count: t.partitions.len(),
                partitions: t.partitions.into_iter().collect(),
            })
            .collect())
    }

    pub async fn create_topic(
        brokers: &str,
        name: &str,
        num_partitions: i32,
        replication_factor: i16,
    ) -> Result<(), String> {
        let client = Self::client(brokers).await?;
        let controller = client.controller_client().map_err(|e| e.to_string())?;
        controller
            .create_topic(name, num_partitions, replication_factor, ADMIN_TIMEOUT_MS)
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn delete_topic(brokers: &str, name: &str) -> Result<(), String> {
        let client = Self::client(brokers).await?;
        let controller = client.controller_client().map_err(|e| e.to_string())?;
        controller
            .delete_topic(name, ADMIN_TIMEOUT_MS)
            .await
            .map_err(|e| e.to_string())
    }

    /// Truncates every partition of `name` in place via `delete_records`,
    /// rather than delete+recreate — see the plan doc's rationale (avoids
    /// losing topic config, and is a single atomic-per-partition RPC). Only
    /// supported against real Apache Kafka, not Redpanda.
    pub async fn purge_topic(brokers: &str, name: &str) -> Result<(), String> {
        let client = Self::client(brokers).await?;
        let topics = client.list_topics().await.map_err(|e| e.to_string())?;
        let partitions = topics
            .into_iter()
            .find(|t| t.name == name)
            .map(|t| t.partitions)
            .ok_or_else(|| format!("Topic \"{name}\" not found."))?;

        let purges = partitions.into_iter().map(|partition| {
            let client = &client;
            let name = name.to_string();
            async move {
                let partition_client = client
                    .partition_client(name, partition, UnknownTopicHandling::Error)
                    .await
                    .map_err(|e| e.to_string())?;
                let latest = partition_client
                    .get_offset(OffsetAt::Latest)
                    .await
                    .map_err(|e| e.to_string())?;
                partition_client
                    .delete_records(latest, ADMIN_TIMEOUT_MS)
                    .await
                    .map_err(|e| e.to_string())
            }
        });

        try_join_all(purges).await?;
        Ok(())
    }
}
