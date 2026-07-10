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
