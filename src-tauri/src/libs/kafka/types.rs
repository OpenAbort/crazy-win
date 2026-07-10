#[derive(serde::Serialize)]
pub struct TopicSummary {
    pub name: String,
    pub partition_count: usize,
    pub partitions: Vec<i32>,
}

#[derive(serde::Serialize)]
pub struct BrokerSummary {
    pub host: String,
    pub port: u16,
}

#[derive(Clone, serde::Serialize)]
pub struct KafkaMessage {
    pub partition: i32,
    pub offset: i64,
    pub timestamp_ms: i64,
    pub key: Option<String>,
    pub value: Option<String>,
    pub headers: Vec<(String, String)>,
}

/// Parses a comma/whitespace-separated bootstrap list like
/// `"localhost:9092, other:9093"` into `(host, port)` pairs for display, and
/// into a plain `Vec<String>` (as rskafka's `ClientBuilder` expects) for
/// connecting.
pub fn parse_brokers(brokers: &str) -> Vec<String> {
    brokers
        .split(|c: char| c == ',' || c.is_whitespace())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

pub fn brokers_to_summaries(brokers: &str) -> Vec<BrokerSummary> {
    parse_brokers(brokers)
        .into_iter()
        .filter_map(|b| {
            let (host, port) = b.rsplit_once(':')?;
            Some(BrokerSummary {
                host: host.to_string(),
                port: port.parse().ok()?,
            })
        })
        .collect()
}
