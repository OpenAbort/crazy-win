export type JwtExpiryStatus = "valid" | "expired" | "none";

export interface JwtExpiry {
  status: JwtExpiryStatus;
  label: string;
}

export interface JwtDecodeResult {
  header: string | null;
  payload: string | null;
  signature: string | null;
  expiry: JwtExpiry | null;
  error: string | null;
}

const EMPTY_RESULT: JwtDecodeResult = { header: null, payload: null, signature: null, expiry: null, error: null };

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function decodeJwt(token: string): JwtDecodeResult {
  const trimmed = token.trim();
  if (!trimmed) return EMPTY_RESULT;

  const parts = trimmed.split(".");
  if (parts.length !== 3) {
    return {
      ...EMPTY_RESULT,
      error: "A JWT must have three dot-separated parts (header.payload.signature).",
    };
  }

  try {
    const header = JSON.parse(base64UrlDecode(parts[0]));
    const payload = JSON.parse(base64UrlDecode(parts[1]));

    let expiry: JwtExpiry = { status: "none", label: "No exp claim" };
    if (typeof payload.exp === "number") {
      const expiresAt = new Date(payload.exp * 1000);
      expiry =
        expiresAt.getTime() < Date.now()
          ? { status: "expired", label: `Expired ${expiresAt.toLocaleString()}` }
          : { status: "valid", label: `Valid until ${expiresAt.toLocaleString()}` };
    }

    return {
      header: JSON.stringify(header, null, 2),
      payload: JSON.stringify(payload, null, 2),
      signature: parts[2],
      expiry,
      error: null,
    };
  } catch (e) {
    return { ...EMPTY_RESULT, error: e instanceof Error ? e.message : String(e) };
  }
}
