export function generateUuids(count: number): string[] {
  return Array.from({ length: count }, () => crypto.randomUUID());
}

export type RandomStringCharset = "alphanumeric" | "hex" | "alphanumeric-symbols";

const CHARSETS: Record<RandomStringCharset, string> = {
  alphanumeric: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  hex: "0123456789abcdef",
  "alphanumeric-symbols": "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+",
};

export function generateRandomStrings(count: number, length: number, charset: RandomStringCharset): string[] {
  const chars = CHARSETS[charset];
  return Array.from({ length: count }, () => {
    const values = crypto.getRandomValues(new Uint32Array(length));
    return Array.from(values, (v) => chars[v % chars.length]).join("");
  });
}
