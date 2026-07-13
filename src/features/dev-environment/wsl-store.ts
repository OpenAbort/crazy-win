import { getStore } from "@/features/dev-environment/dev-environment-store";

export interface WslQuickCommand {
  id: string;
  command: string;
  alias?: string;
  ranAt: number;
}

const MAX_QUICK_COMMANDS = 50;

export async function getLastWslDistro(): Promise<string | null> {
  const store = await getStore();
  return (await store.get<string>("wsl-last-distro")) ?? null;
}

export async function setLastWslDistro(distro: string): Promise<void> {
  const store = await getStore();
  await store.set("wsl-last-distro", distro);
}

export async function getWslQuickCommands(): Promise<WslQuickCommand[]> {
  const store = await getStore();
  return (await store.get<WslQuickCommand[]>("wsl-quick-commands")) ?? [];
}

export async function addWslQuickCommand(command: string, alias?: string): Promise<WslQuickCommand[]> {
  const store = await getStore();
  const existing = (await store.get<WslQuickCommand[]>("wsl-quick-commands")) ?? [];
  const next = [{ id: crypto.randomUUID(), command, alias, ranAt: Date.now() }, ...existing].slice(0, MAX_QUICK_COMMANDS);
  await store.set("wsl-quick-commands", next);
  return next;
}

export async function removeWslQuickCommand(id: string): Promise<WslQuickCommand[]> {
  const store = await getStore();
  const existing = (await store.get<WslQuickCommand[]>("wsl-quick-commands")) ?? [];
  const next = existing.filter((c) => c.id !== id);
  await store.set("wsl-quick-commands", next);
  return next;
}

export async function updateWslQuickCommand(
  id: string,
  updates: { command?: string; alias?: string },
): Promise<WslQuickCommand[]> {
  const store = await getStore();
  const existing = (await store.get<WslQuickCommand[]>("wsl-quick-commands")) ?? [];
  const next = existing.map((c) => (c.id === id ? { ...c, ...updates } : c));
  await store.set("wsl-quick-commands", next);
  return next;
}

export async function getWslLastCwd(distro: string): Promise<string | null> {
  const store = await getStore();
  return (await store.get<string>(`wsl-last-cwd-${distro}`)) ?? null;
}

export async function setWslLastCwd(distro: string, path: string): Promise<void> {
  const store = await getStore();
  await store.set(`wsl-last-cwd-${distro}`, path);
}
