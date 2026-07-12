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

export interface KafkaMessageRow {
  partition: number;
  offset: number;
  timestamp_ms: number;
  key: string | null;
  value: string | null;
  headers: [string, string][];
}

export function filterMessages(messages: KafkaMessageRow[], query: string): KafkaMessageRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return messages;
  return messages.filter((m) => {
    if (m.key?.toLowerCase().includes(q)) return true;
    if (m.value?.toLowerCase().includes(q)) return true;
    return m.headers.some(([k, v]) => k.toLowerCase().includes(q) || v.toLowerCase().includes(q));
  });
}
