export type K8sKind = "pods" | "deployments" | "services";

export interface K8sResourceSummary {
  name: string;
  namespace: string;
  status: string;
  raw: unknown;
}

export function parseContextNames(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

interface K8sListResponse {
  items?: Array<{
    metadata?: { name?: string; namespace?: string };
    status?: {
      phase?: string;
      readyReplicas?: number;
      loadBalancer?: unknown;
    };
    spec?: { replicas?: number; type?: string };
  }>;
}

export function parseNamespaceList(raw: string): string[] {
  const parsed = JSON.parse(raw) as K8sListResponse;
  return (parsed.items ?? [])
    .map((item) => item.metadata?.name)
    .filter((name): name is string => !!name)
    .sort();
}

function describeStatus(kind: K8sKind, item: NonNullable<K8sListResponse["items"]>[number]): string {
  if (kind === "pods") return item.status?.phase ?? "Unknown";
  if (kind === "deployments") {
    const ready = item.status?.readyReplicas ?? 0;
    const desired = item.spec?.replicas ?? 0;
    return `${ready}/${desired} ready`;
  }
  return item.spec?.type ?? "Unknown";
}

export function parseResourceList(raw: string, kind: K8sKind): K8sResourceSummary[] {
  const parsed = JSON.parse(raw) as K8sListResponse;
  return (parsed.items ?? []).map((item) => ({
    name: item.metadata?.name ?? "",
    namespace: item.metadata?.namespace ?? "",
    status: describeStatus(kind, item),
    raw: item,
  }));
}
