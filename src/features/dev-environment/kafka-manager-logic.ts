export interface KafkaTopicSummary {
  name: string;
  partition_count: number;
  partitions: number[];
}

export interface KafkaBrokerSummary {
  host: string;
  port: number;
}

export function parseTopicList(raw: string): KafkaTopicSummary[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  return JSON.parse(trimmed) as KafkaTopicSummary[];
}

export function parseBrokerList(raw: string): KafkaBrokerSummary[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  return JSON.parse(trimmed) as KafkaBrokerSummary[];
}

export function filterTopics(topics: KafkaTopicSummary[], query: string): KafkaTopicSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return topics;
  return topics.filter((t) => t.name.toLowerCase().includes(q));
}
