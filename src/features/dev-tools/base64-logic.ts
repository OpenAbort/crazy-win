export interface Base64Result {
  output: string;
  error: string | null;
}

function stringToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToString(b64: string): string {
  const binary = atob(b64.replace(/\s/g, "")); // tolerate pasted multi-line base64; throws on invalid input
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes); // throws on invalid UTF-8
}

export function encodeBase64(input: string): Base64Result {
  if (!input) return { output: "", error: null };
  try {
    return { output: stringToBase64(input), error: null };
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : String(e) };
  }
}

export function decodeBase64(input: string): Base64Result {
  if (!input.trim()) return { output: "", error: null };
  try {
    return { output: base64ToString(input), error: null };
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : String(e) };
  }
}
