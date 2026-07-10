import { getStore } from "@/features/dev-environment/dev-environment-store";

export type KafkaTarget = "docker" | "helm";

export interface KafkaDockerConfig {
  containerName: string;
  image: string;
  port: number;
  extraEnv: [string, string][];
}

export interface KafkaHelmConfig {
  namespace: string;
  release: string;
  chart: string;
  valuesOverrides: [string, string][];
}

export interface KafkaProduceHistoryEntry {
  id: string;
  timestamp: number;
  topic: string;
  partition: number;
  key: string | null;
  value: string | null;
  headers: [string, string][];
}

const DEFAULT_DOCKER_CONFIG: KafkaDockerConfig = {
  containerName: "devbox-kafka",
  image: "apache/kafka:3.9.0",
  port: 9092,
  extraEnv: [],
};

const DEFAULT_HELM_CONFIG: KafkaHelmConfig = {
  namespace: "kafka",
  release: "devbox-kafka",
  chart: "oci://registry-1.docker.io/bitnamicharts/kafka",
  valuesOverrides: [],
};

const PRODUCE_HISTORY_LIMIT = 50;

async function getString(key: string): Promise<string | null> {
  const store = await getStore();
  return (await store.get<string>(key)) ?? null;
}

async function setString(key: string, value: string | null): Promise<void> {
  const store = await getStore();
  if (value === null) {
    await store.delete(key);
  } else {
    await store.set(key, value);
  }
}

export async function getKafkaBrokers(): Promise<string> {
  return (await getString("kafka-brokers")) ?? "";
}

export async function setKafkaBrokers(brokers: string): Promise<void> {
  await setString("kafka-brokers", brokers);
}

export async function getKafkaTarget(): Promise<KafkaTarget> {
  return ((await getString("kafka-target")) as KafkaTarget | null) ?? "docker";
}

export async function setKafkaTarget(target: KafkaTarget): Promise<void> {
  await setString("kafka-target", target);
}

export async function getKafkaDockerConfig(): Promise<KafkaDockerConfig> {
  const raw = await getString("kafka-docker-config");
  if (!raw) return DEFAULT_DOCKER_CONFIG;
  try {
    return { ...DEFAULT_DOCKER_CONFIG, ...(JSON.parse(raw) as Partial<KafkaDockerConfig>) };
  } catch {
    return DEFAULT_DOCKER_CONFIG;
  }
}

export async function setKafkaDockerConfig(cfg: KafkaDockerConfig): Promise<void> {
  await setString("kafka-docker-config", JSON.stringify(cfg));
}

export async function getKafkaHelmConfig(): Promise<KafkaHelmConfig> {
  const raw = await getString("kafka-helm-config");
  if (!raw) return DEFAULT_HELM_CONFIG;
  try {
    return { ...DEFAULT_HELM_CONFIG, ...(JSON.parse(raw) as Partial<KafkaHelmConfig>) };
  } catch {
    return DEFAULT_HELM_CONFIG;
  }
}

export async function setKafkaHelmConfig(cfg: KafkaHelmConfig): Promise<void> {
  await setString("kafka-helm-config", JSON.stringify(cfg));
}

export async function getKafkaProduceHistory(): Promise<KafkaProduceHistoryEntry[]> {
  const raw = await getString("kafka-produce-history");
  if (!raw) return [];
  try {
    return JSON.parse(raw) as KafkaProduceHistoryEntry[];
  } catch {
    return [];
  }
}

export async function addKafkaProduceHistoryEntry(entry: KafkaProduceHistoryEntry): Promise<void> {
  const current = await getKafkaProduceHistory();
  const next = [entry, ...current].slice(0, PRODUCE_HISTORY_LIMIT);
  await setString("kafka-produce-history", JSON.stringify(next));
}

export async function clearKafkaProduceHistory(): Promise<void> {
  await setString("kafka-produce-history", null);
}
