import type { TransformResult } from "@/features/dev-tools/text-transform-tool";

export function encodeUrl(input: string): TransformResult {
  if (!input) return { output: "", error: null };
  try {
    return { output: encodeURIComponent(input), error: null };
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : String(e) };
  }
}

export function decodeUrl(input: string): TransformResult {
  if (!input) return { output: "", error: null };
  try {
    return { output: decodeURIComponent(input), error: null };
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : String(e) };
  }
}

export function parseUrl(input: string): TransformResult {
  if (!input.trim()) return { output: "", error: null };
  try {
    const url = new URL(input.trim());
    const lines = [
      `Protocol:  ${url.protocol}`,
      `Host:      ${url.host}`,
      `Hostname:  ${url.hostname}`,
      `Port:      ${url.port || "(default)"}`,
      `Path:      ${url.pathname}`,
      `Hash:      ${url.hash || "(none)"}`,
    ];
    const params = [...url.searchParams.entries()];
    if (params.length > 0) {
      lines.push("", "Query parameters:");
      for (const [key, value] of params) {
        lines.push(`  ${key} = ${value}`);
      }
    }
    return { output: lines.join("\n"), error: null };
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : String(e) };
  }
}
