import { getStore } from "@/features/dev-environment/dev-environment-store";

export interface QuickCommand {
  id: string;
  command: string;
  alias?: string;
  ranAt: number;
}

const MAX_QUICK_COMMANDS = 50;

function storageKey(namespace: string): string {
  return `${namespace}-quick-commands`;
}

export async function getQuickCommands(namespace: string): Promise<QuickCommand[]> {
  const store = await getStore();
  return (await store.get<QuickCommand[]>(storageKey(namespace))) ?? [];
}

export async function addQuickCommand(namespace: string, command: string, alias?: string): Promise<QuickCommand[]> {
  const store = await getStore();
  const key = storageKey(namespace);
  const existing = (await store.get<QuickCommand[]>(key)) ?? [];
  const next = [{ id: crypto.randomUUID(), command, alias, ranAt: Date.now() }, ...existing].slice(0, MAX_QUICK_COMMANDS);
  await store.set(key, next);
  return next;
}

export async function removeQuickCommand(namespace: string, id: string): Promise<QuickCommand[]> {
  const store = await getStore();
  const key = storageKey(namespace);
  const existing = (await store.get<QuickCommand[]>(key)) ?? [];
  const next = existing.filter((c) => c.id !== id);
  await store.set(key, next);
  return next;
}

export async function updateQuickCommand(
  namespace: string,
  id: string,
  updates: { command?: string; alias?: string },
): Promise<QuickCommand[]> {
  const store = await getStore();
  const key = storageKey(namespace);
  const existing = (await store.get<QuickCommand[]>(key)) ?? [];
  const next = existing.map((c) => (c.id === id ? { ...c, ...updates } : c));
  await store.set(key, next);
  return next;
}
