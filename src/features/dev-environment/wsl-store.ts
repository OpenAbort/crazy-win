import { getStore } from "@/features/dev-environment/dev-environment-store";
import {
  addQuickCommand,
  getQuickCommands,
  removeQuickCommand,
  updateQuickCommand,
  type QuickCommand,
} from "@/features/dev-environment/quick-commands-store";

export type WslQuickCommand = QuickCommand;

const NAMESPACE = "wsl";

export async function getLastWslDistro(): Promise<string | null> {
  const store = await getStore();
  return (await store.get<string>("wsl-last-distro")) ?? null;
}

export async function setLastWslDistro(distro: string): Promise<void> {
  const store = await getStore();
  await store.set("wsl-last-distro", distro);
}

export async function getWslQuickCommands(): Promise<WslQuickCommand[]> {
  return getQuickCommands(NAMESPACE);
}

export async function addWslQuickCommand(command: string, alias?: string): Promise<WslQuickCommand[]> {
  return addQuickCommand(NAMESPACE, command, alias);
}

export async function removeWslQuickCommand(id: string): Promise<WslQuickCommand[]> {
  return removeQuickCommand(NAMESPACE, id);
}

export async function updateWslQuickCommand(
  id: string,
  updates: { command?: string; alias?: string },
): Promise<WslQuickCommand[]> {
  return updateQuickCommand(NAMESPACE, id, updates);
}

export async function getWslLastCwd(distro: string): Promise<string | null> {
  const store = await getStore();
  return (await store.get<string>(`wsl-last-cwd-${distro}`)) ?? null;
}

export async function setWslLastCwd(distro: string, path: string): Promise<void> {
  const store = await getStore();
  await store.set(`wsl-last-cwd-${distro}`, path);
}
