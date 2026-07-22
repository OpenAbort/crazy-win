import { invoke } from "@tauri-apps/api/core";

let cached: Promise<string> | null = null;

/// Resolves once to the host OS ("windows" | "linux" | "macos"), used to hide
/// tools with no Linux/macOS equivalent. Falls back to "windows" (today's only
/// shipped platform) if the call ever fails, so nothing gets hidden by mistake.
export function getPlatform(): Promise<string> {
  cached ??= invoke<string>("app_platform").catch(() => "windows");
  return cached;
}
