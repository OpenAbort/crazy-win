export interface TimestampResult {
  epochSeconds: string;
  epochMillis: string;
  iso: string;
  utc: string;
  local: string;
  relative: string;
  error: string | null;
}

const EMPTY: TimestampResult = {
  epochSeconds: "",
  epochMillis: "",
  iso: "",
  utc: "",
  local: "",
  relative: "",
  error: null,
};

const UNITS: [string, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

function relativeTime(date: Date): string {
  const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  for (const [name, secs] of UNITS) {
    if (abs >= secs || name === "second") {
      const value = Math.round(diffSec / secs);
      if (value === 0 && name !== "second") continue;
      const plural = Math.abs(value) === 1 ? name : `${name}s`;
      return value <= 0 ? `${Math.abs(value)} ${plural} ago` : `in ${value} ${plural}`;
    }
  }
  return "just now";
}

function buildResult(date: Date): TimestampResult {
  return {
    epochSeconds: String(Math.floor(date.getTime() / 1000)),
    epochMillis: String(date.getTime()),
    iso: date.toISOString(),
    utc: date.toUTCString(),
    local: date.toString(),
    relative: relativeTime(date),
    error: null,
  };
}

/// A 13+ digit epoch value is treated as milliseconds, anything shorter as
/// seconds — matches the common Unix-epoch-seconds (10 digits until year
/// 2286) vs. JS-epoch-milliseconds (13 digits) convention.
export function fromEpoch(raw: string): TimestampResult {
  const trimmed = raw.trim();
  if (!trimmed) return EMPTY;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return { ...EMPTY, error: "Not a valid number" };
  const digitCount = trimmed.replace(/[^0-9]/g, "").length;
  const ms = digitCount >= 13 ? n : n * 1000;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return { ...EMPTY, error: "Out of range" };
  return buildResult(date);
}

export function fromDateString(raw: string): TimestampResult {
  const trimmed = raw.trim();
  if (!trimmed) return EMPTY;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return { ...EMPTY, error: "Not a valid date" };
  return buildResult(date);
}
