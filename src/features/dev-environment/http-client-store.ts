import { getStore } from "@/features/dev-environment/dev-environment-store";

export interface HttpHistoryEntry {
  id: string;
  method: string;
  url: string;
  headers: [string, string][];
  body: string;
  timestamp: number;
}

const MAX_HISTORY = 100;
const KEY = "http-client-history";

export async function getHttpHistory(): Promise<HttpHistoryEntry[]> {
  const store = await getStore();
  return (await store.get<HttpHistoryEntry[]>(KEY)) ?? [];
}

export async function addHttpHistoryEntry(
  entry: Omit<HttpHistoryEntry, "id" | "timestamp">,
): Promise<HttpHistoryEntry[]> {
  const store = await getStore();
  const existing = (await store.get<HttpHistoryEntry[]>(KEY)) ?? [];
  const next = [{ ...entry, id: crypto.randomUUID(), timestamp: Date.now() }, ...existing].slice(0, MAX_HISTORY);
  await store.set(KEY, next);
  return next;
}

export async function removeHttpHistoryEntry(id: string): Promise<HttpHistoryEntry[]> {
  const store = await getStore();
  const existing = (await store.get<HttpHistoryEntry[]>(KEY)) ?? [];
  const next = existing.filter((e) => e.id !== id);
  await store.set(KEY, next);
  return next;
}
