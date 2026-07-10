import { load, type Store } from "@tauri-apps/plugin-store";

export type ConnectionMode = "cli" | "api";

let storePromise: Promise<Store> | null = null;

export function getStore(): Promise<Store> {
  storePromise ??= load("dev-environment-settings.json", { defaults: {}, autoSave: true });
  return storePromise;
}

async function getString(key: string): Promise<string | null> {
  const store = await getStore();
  return (await store.get<string>(key)) ?? null;
}

async function setString(key: string, value: string | null): Promise<void> {
  const store = await getStore();
  if (value === null) {
    await store.delete(key);
  } else {
    await store.set(key, value);
  }
}

export async function getDockerHost(): Promise<string> {
  return (await getString("docker-host")) ?? "";
}

export async function setDockerHost(host: string): Promise<void> {
  await setString("docker-host", host);
}

export async function getKubeContext(): Promise<string | null> {
  return getString("kube-context");
}

export async function setKubeContext(context: string | null): Promise<void> {
  await setString("kube-context", context);
  // Namespaces are scoped to a context, so a stale namespace from a previous
  // context should never carry over silently.
  await setString("kube-namespace", null);
}

export async function getKubeNamespace(): Promise<string | null> {
  return getString("kube-namespace");
}

export async function setKubeNamespace(namespace: string | null): Promise<void> {
  await setString("kube-namespace", namespace);
}

export async function getDockerMode(): Promise<ConnectionMode> {
  return ((await getString("docker-mode")) as ConnectionMode | null) ?? "cli";
}

export async function setDockerMode(mode: ConnectionMode): Promise<void> {
  await setString("docker-mode", mode);
}

export async function getKubeMode(): Promise<ConnectionMode> {
  return ((await getString("kube-mode")) as ConnectionMode | null) ?? "cli";
}

export async function setKubeMode(mode: ConnectionMode): Promise<void> {
  await setString("kube-mode", mode);
}
