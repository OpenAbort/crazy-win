export interface DockerContainerSummary {
  ID: string;
  Image: string;
  Names: string;
  State: string;
  Status: string;
  Ports: string;
  [key: string]: unknown;
}

/// `docker ps --format json` emits JSON Lines (one object per line), not a single array.
export function parseContainerList(raw: string): DockerContainerSummary[] {
  const containers: DockerContainerSummary[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      containers.push(JSON.parse(trimmed) as DockerContainerSummary);
    } catch {
      // Skip a malformed line rather than failing the whole list.
    }
  }
  return containers;
}

/// `docker inspect <id>` returns a JSON array with one element for a single id.
export function parseInspect(raw: string): unknown {
  const parsed = JSON.parse(raw) as unknown[];
  return parsed[0] ?? null;
}

export function filterContainers(
  containers: DockerContainerSummary[],
  query: string,
): DockerContainerSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return containers;
  return containers.filter(
    (c) =>
      c.Names.toLowerCase().includes(q) ||
      c.Image.toLowerCase().includes(q) ||
      c.ID.toLowerCase().includes(q),
  );
}

export interface DockerImageSummary {
  ID: string;
  Repository: string;
  Tag: string;
  Size: string;
  CreatedAt: string;
  [key: string]: unknown;
}

export interface DockerVolumeSummary {
  Name: string;
  Driver: string;
  Mountpoint: string;
  Scope: string;
  [key: string]: unknown;
}

export interface DockerNetworkSummary {
  ID: string;
  Name: string;
  Driver: string;
  Scope: string;
  [key: string]: unknown;
}

/// `docker images`/`docker volume ls`/`docker network ls --format json` all
/// emit JSON Lines like `docker ps`, so this is a straight generalization of
/// `parseContainerList`.
function parseJsonLines<T>(raw: string): T[] {
  const items: T[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      items.push(JSON.parse(trimmed) as T);
    } catch {
      // Skip a malformed line rather than failing the whole list.
    }
  }
  return items;
}

export function parseImageList(raw: string): DockerImageSummary[] {
  return parseJsonLines<DockerImageSummary>(raw);
}

export function parseVolumeList(raw: string): DockerVolumeSummary[] {
  return parseJsonLines<DockerVolumeSummary>(raw);
}

export function parseNetworkList(raw: string): DockerNetworkSummary[] {
  return parseJsonLines<DockerNetworkSummary>(raw);
}

export function filterImages(images: DockerImageSummary[], query: string): DockerImageSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return images;
  return images.filter(
    (i) =>
      i.Repository.toLowerCase().includes(q) ||
      i.Tag.toLowerCase().includes(q) ||
      i.ID.toLowerCase().includes(q),
  );
}

export function filterVolumes(volumes: DockerVolumeSummary[], query: string): DockerVolumeSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return volumes;
  return volumes.filter((v) => v.Name.toLowerCase().includes(q) || v.Driver.toLowerCase().includes(q));
}

export function filterNetworks(networks: DockerNetworkSummary[], query: string): DockerNetworkSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return networks;
  return networks.filter(
    (n) => n.Name.toLowerCase().includes(q) || n.Driver.toLowerCase().includes(q) || n.ID.toLowerCase().includes(q),
  );
}

/// Direct API mode reports raw byte counts as plain numeric strings; CLI mode
/// already emits a human-formatted string (e.g. "128MB"). Only reformat the
/// former, and pass the latter through unchanged.
export function formatBytes(value: string): string {
  if (!/^\d+$/.test(value.trim())) return value;
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exp).toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`;
}

/// Direct API mode reports Unix timestamps (seconds) as plain numeric
/// strings; CLI mode already emits a human-formatted date string. Only
/// reformat the former, and pass the latter through unchanged.
export function formatAgo(value: string): string {
  if (!/^\d+$/.test(value.trim())) return value;
  const seconds = Math.floor(Date.now() / 1000) - Number(value);
  if (seconds < 60) return "just now";
  const units: [number, string][] = [
    [31536000, "year"],
    [2592000, "month"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [unitSeconds, label] of units) {
    const count = Math.floor(seconds / unitSeconds);
    if (count >= 1) return `${count} ${label}${count > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

export const DEFAULT_NETWORKS = new Set(["bridge", "host", "none"]);
