export interface HelmReleaseSummary {
  name: string;
  namespace: string;
  revision: string;
  status: string;
  chart: string;
  app_version: string;
}

export function parseReleaseList(raw: string): HelmReleaseSummary[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed) as HelmReleaseSummary[];
  return parsed;
}
