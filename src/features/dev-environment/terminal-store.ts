import { getStore } from "@/features/dev-environment/dev-environment-store";

export async function getTerminalLastCwd(): Promise<string | null> {
  const store = await getStore();
  return (await store.get<string>("terminal-last-cwd")) ?? null;
}

export async function setTerminalLastCwd(path: string): Promise<void> {
  const store = await getStore();
  await store.set("terminal-last-cwd", path);
}
