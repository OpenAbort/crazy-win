import type { DockerContainerSummary } from "@/features/dev-environment/docker-manager-logic";
import type { HelmReleaseSummary } from "@/features/dev-environment/helm-releases-logic";

const KAFKA_IMAGE_HINTS = ["kafka", "redpanda", "bitnami/kafka", "confluentinc/cp-kafka", "apache/kafka"];
const DEFAULT_KAFKA_PORT = 9092;

/// Extracts the first mapped host port from a `docker ps` "Ports" string like
/// `"0.0.0.0:9092->9092/tcp, :::9092->9092/tcp"`.
function extractMappedPort(ports: string): number | null {
  const match = ports.match(/:(\d{1,5})->\d{1,5}\/tcp/);
  return match ? Number(match[1]) : null;
}

/// Strips the `tcp://`/`http(s)://` scheme and trailing port from a configured
/// Docker host string, e.g. `"tcp://192.168.1.10:2375"` -> `"192.168.1.10"`.
/// Falls back to `"localhost"` for an empty host (local socket).
export function dockerBrokerHost(dockerHost: string): string {
  const trimmed = dockerHost.trim();
  if (!trimmed) return "localhost";
  const withoutScheme = trimmed.replace(/^tcp:\/\//, "").replace(/^https?:\/\//, "");
  return withoutScheme.split(":")[0] || "localhost";
}

/// Bitnami's Kafka chart names its broker bootstrap service `<release>-kafka`;
/// other charts won't resolve correctly here and need brokers entered manually.
export function helmBrokerAddress(release: string, namespace: string, port = DEFAULT_KAFKA_PORT): string {
  return `${release}-kafka.${namespace}.svc.cluster.local:${port}`;
}

export interface DetectedDockerKafka {
  brokers: string;
}

export function detectDockerKafka(
  containers: DockerContainerSummary[],
  dockerHost: string,
): DetectedDockerKafka | null {
  const candidate = containers.find((c) => {
    const image = c.Image.toLowerCase();
    if (image.includes("zookeeper")) return false;
    return c.State === "running" && KAFKA_IMAGE_HINTS.some((hint) => image.includes(hint));
  });
  if (!candidate) return null;

  const port = extractMappedPort(candidate.Ports) ?? DEFAULT_KAFKA_PORT;
  return { brokers: `${dockerBrokerHost(dockerHost)}:${port}` };
}

export interface DetectedHelmKafka {
  brokers: string;
  release: string;
  namespace: string;
}

export function detectHelmKafka(releases: HelmReleaseSummary[]): DetectedHelmKafka | null {
  const candidate = releases.find((r) => {
    const chart = r.chart.toLowerCase();
    return r.status === "deployed" && (chart.includes("kafka") || chart.includes("redpanda"));
  });
  if (!candidate) return null;

  return {
    brokers: helmBrokerAddress(candidate.name, candidate.namespace),
    release: candidate.name,
    namespace: candidate.namespace,
  };
}
