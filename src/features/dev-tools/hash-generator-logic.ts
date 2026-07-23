export interface HashResult {
  algorithm: string;
  hex: string;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function digestHex(algorithm: string, bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(algorithm, bytes);
  return toHex(new Uint8Array(digest));
}

/// Web Crypto's SubtleCrypto dropped MD5 (deprecated for security use), but
/// it's still widely needed for legacy checksums/fingerprints — implemented
/// here directly per RFC 1321 rather than adding a hashing dependency, since
/// this is a well-known, publicly-documented algorithm.
function md5(bytes: Uint8Array): string {
  function rotl(x: number, c: number): number {
    return (x << c) | (x >>> (32 - c));
  }
  function add32(a: number, b: number): number {
    return (a + b) | 0;
  }

  const K = new Int32Array(64);
  for (let i = 0; i < 64; i++) {
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0;
  }
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5,
    9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6,
    10, 15, 21, 6, 10, 15, 21,
  ];

  const originalLengthBits = BigInt(bytes.length) * 8n;
  let paddedLength = bytes.length + 1;
  while (paddedLength % 64 !== 56) paddedLength++;
  paddedLength += 8;

  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setBigUint64(paddedLength - 8, originalLengthBits, true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const chunks = paddedLength / 64;
  for (let chunk = 0; chunk < chunks; chunk++) {
    const M = new Int32Array(16);
    for (let i = 0; i < 16; i++) {
      M[i] = view.getInt32(chunk * 64 + i * 4, true);
    }

    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;

    for (let i = 0; i < 64; i++) {
      let F: number;
      let g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = add32(add32(add32(F, A), K[i]), M[g]);
      A = D;
      D = C;
      C = B;
      B = add32(B, rotl(F, S[i]));
    }

    a0 = add32(a0, A);
    b0 = add32(b0, B);
    c0 = add32(c0, C);
    d0 = add32(d0, D);
  }

  function toHexLE(n: number): string {
    const b = [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
    return b.map((x) => x.toString(16).padStart(2, "0")).join("");
  }

  return toHexLE(a0) + toHexLE(b0) + toHexLE(c0) + toHexLE(d0);
}

export async function computeHashes(input: string): Promise<HashResult[]> {
  const bytes = new TextEncoder().encode(input);
  const [sha1, sha256, sha384, sha512] = await Promise.all([
    digestHex("SHA-1", bytes),
    digestHex("SHA-256", bytes),
    digestHex("SHA-384", bytes),
    digestHex("SHA-512", bytes),
  ]);
  return [
    { algorithm: "MD5", hex: md5(bytes) },
    { algorithm: "SHA-1", hex: sha1 },
    { algorithm: "SHA-256", hex: sha256 },
    { algorithm: "SHA-384", hex: sha384 },
    { algorithm: "SHA-512", hex: sha512 },
  ];
}
