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

export function filterResources(resources: K8sResourceSummary[], query: string): K8sResourceSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return resources;
  return resources.filter((r) => r.name.toLowerCase().includes(q) || r.namespace.toLowerCase().includes(q));
}

/// Green for a healthy/ready state, amber for in-progress, red for failed —
/// matches the `text-emerald-600 dark:text-emerald-400` convention already
/// used elsewhere in this app (text-comparer.tsx, docker-manager.tsx, etc.).
export function statusColorClass(kind: K8sKind, status: string): string {
  if (kind === "pods") {
    if (status === "Running" || status === "Succeeded") return "text-emerald-600 dark:text-emerald-400";
    if (status === "Pending") return "text-amber-600 dark:text-amber-400";
    if (status === "Failed" || status === "Unknown") return "text-red-600 dark:text-red-400";
    return "";
  }
  if (kind === "deployments") {
    const [ready, desired] = status.split("/").map((s) => parseInt(s, 10));
    if (Number.isFinite(ready) && Number.isFinite(desired) && desired > 0 && ready >= desired) {
      return "text-emerald-600 dark:text-emerald-400";
    }
    return "text-amber-600 dark:text-amber-400";
  }
  return "";
}
