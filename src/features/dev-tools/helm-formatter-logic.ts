export type SetMode = "set" | "set-string" | "set-json" | "set-file";
export type ValueKind = "string" | "bool";

export interface SetEntry {
  kind: "set";
  id: string;
  mode: SetMode;
  key: string;
  value: string;
  valueKind: ValueKind;
}

export interface OtherFlag {
  kind: "other";
  id: string;
  name: string;
  /** null = standalone/boolean flag with no value. */
  value: string | null;
}

export type FlagToken = SetEntry | OtherFlag;

export interface ParsedHelmCommand {
  baseCommand: string[];
  flags: FlagToken[];
}

export type TargetOs = "linux" | "windows";

interface Token {
  value: string;
  raw: string;
}

const SET_MODES: SetMode[] = ["set", "set-string", "set-json", "set-file"];

function newId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Collapse a possibly multi-line, possibly continuation-marked command into
 * one logical line. Handles `\` (bash) and `^` (cmd.exe) trailing
 * continuations, and is lenient about plain multi-line paste with no
 * continuation markers at all. */
export function normalizeContinuations(input: string): string {
  const lines = input
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines
    .map((line) => {
      const last = line[line.length - 1];
      if (last === "\\" || last === "^") {
        return line.slice(0, -1).trimEnd();
      }
      return line;
    })
    .join(" ");
}

/** Quote-aware tokenizer: splits on unquoted whitespace. Single quotes are
 * fully literal; double quotes interpret `\"` and `\\`. Never throws. */
function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let value = "";
  let raw = "";
  let hasToken = false;
  let quote: "'" | '"' | null = null;

  function flush() {
    if (hasToken) tokens.push({ value, raw });
    value = "";
    raw = "";
    hasToken = false;
  }

  for (let i = 0; i < line.length; i++) {
    const c = line[i];

    if (quote === "'") {
      raw += c;
      if (c === "'") quote = null;
      else value += c;
      continue;
    }

    if (quote === '"') {
      if (c === "\\" && (line[i + 1] === '"' || line[i + 1] === "\\")) {
        raw += c + line[i + 1];
        value += line[i + 1];
        i++;
        continue;
      }
      raw += c;
      if (c === '"') quote = null;
      else value += c;
      continue;
    }

    if (c === " " || c === "\t") {
      flush();
      continue;
    }

    if (c === "'" || c === '"') {
      quote = c;
      raw += c;
      hasToken = true;
      continue;
    }

    value += c;
    raw += c;
    hasToken = true;
  }
  flush();
  return tokens;
}

/** Split a raw (still-quoted) value on commas at brace/bracket depth 0,
 * outside any quote — so `{a,b,c}` and `"hello, world"` aren't split. */
function splitTopLevelCommas(raw: string): string[] {
  const segments: string[] = [];
  let buf = "";
  let depth = 0;
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];

    if (quote) {
      buf += c;
      if (c === quote && raw[i - 1] !== "\\") quote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      buf += c;
      continue;
    }
    if (c === "{" || c === "[") {
      depth++;
      buf += c;
      continue;
    }
    if (c === "}" || c === "]") {
      depth = Math.max(0, depth - 1);
      buf += c;
      continue;
    }
    if (c === "," && depth === 0) {
      segments.push(buf);
      buf = "";
      continue;
    }
    buf += c;
  }
  segments.push(buf);
  return segments;
}

/** Split raw text at the first unquoted '='. */
function splitFirstUnquotedEquals(raw: string): [string, string] {
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (quote) {
      if (c === quote && raw[i - 1] !== "\\") quote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      continue;
    }
    if (c === "=") return [raw.slice(0, i), raw.slice(i + 1)];
  }
  return [raw, ""];
}

/** Strip quotes/escapes from a raw (possibly quoted) fragment. */
function dequote(raw: string): string {
  let value = "";
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      else value += c;
      continue;
    }
    if (quote === '"') {
      if (c === "\\" && (raw[i + 1] === '"' || raw[i + 1] === "\\")) {
        value += raw[i + 1];
        i++;
        continue;
      }
      if (c === '"') quote = null;
      else value += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      continue;
    }
    value += c;
  }
  return value;
}

function isFlagToken(value: string): boolean {
  return value.length > 1 && value[0] === "-";
}

function setModeFor(flagName: string): SetMode | null {
  const name = flagName.replace(/^--?/, "");
  return (SET_MODES as string[]).includes(name) ? (name as SetMode) : null;
}

export function parseHelmCommand(input: string): ParsedHelmCommand {
  const normalized = normalizeContinuations(input);
  const tokens = tokenize(normalized);

  let i = 0;
  const baseCommand: string[] = [];
  while (i < tokens.length && !isFlagToken(tokens[i].value)) {
    baseCommand.push(tokens[i].value);
    i++;
  }

  const flags: FlagToken[] = [];

  while (i < tokens.length) {
    const token = tokens[i];
    const eqIndex = token.value.indexOf("=");
    let flagName: string;
    let inlineRaw: string | null = null;

    if (eqIndex !== -1) {
      flagName = token.value.slice(0, eqIndex);
      // Find the matching split point in raw (value/raw share the same
      // unquoted structure up to quote boundaries; locate by rescanning raw
      // for the first unquoted '=' after the flag name portion).
      const [, rawAfterEq] = splitFirstUnquotedEquals(token.raw);
      inlineRaw = rawAfterEq;
    } else {
      flagName = token.value;
    }

    const mode = setModeFor(flagName);

    if (mode) {
      let rawValue: string | null = inlineRaw;
      if (rawValue === null) {
        if (i + 1 < tokens.length) {
          rawValue = tokens[i + 1].raw;
          i += 2;
        } else {
          i += 1;
        }
      } else {
        i += 1;
      }

      if (rawValue !== null) {
        const segments = splitTopLevelCommas(rawValue);
        for (const segment of segments) {
          if (segment.trim() === "") continue;
          const [rawKey, rawVal] = splitFirstUnquotedEquals(segment);
          const key = dequote(rawKey);
          const value = dequote(rawVal);
          if (!key) continue;
          const valueKind: ValueKind = value === "true" || value === "false" ? "bool" : "string";
          flags.push({ kind: "set", id: newId(), mode, key, value, valueKind });
        }
      }
      continue;
    }

    // Other flag.
    if (inlineRaw !== null) {
      flags.push({ kind: "other", id: newId(), name: flagName, value: dequote(inlineRaw) });
      i += 1;
      continue;
    }

    const next = tokens[i + 1];
    if (next && !isFlagToken(next.value)) {
      flags.push({ kind: "other", id: newId(), name: flagName, value: dequote(next.raw) });
      i += 2;
    } else {
      flags.push({ kind: "other", id: newId(), name: flagName, value: null });
      i += 1;
    }
  }

  return { baseCommand, flags };
}

const NEEDS_QUOTING = /[\s"'\\$`{}[\],;&|<>()*?!~#^%]/;

function quoteIfNeeded(value: string): string {
  if (value === "") return '""';
  if (!NEEDS_QUOTING.test(value)) return value;
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function renderFlag(token: FlagToken): string {
  if (token.kind === "set") {
    return `--${token.mode} ${token.key}=${quoteIfNeeded(token.value)}`;
  }
  return token.value === null ? token.name : `${token.name} ${quoteIfNeeded(token.value)}`;
}

export function serializeHelmCommand(
  baseCommand: string[],
  flags: FlagToken[],
  os: TargetOs,
): string {
  const firstLine = baseCommand.map(quoteIfNeeded).join(" ");
  const flagLines = flags.map(renderFlag);
  const lines = firstLine ? [firstLine, ...flagLines] : flagLines;

  if (lines.length === 0) return "";
  if (lines.length === 1) return lines[0];

  const contChar = os === "windows" ? "^" : "\\";
  return lines
    .map((line, idx) => {
      const indent = idx === 0 ? "" : "  ";
      const isLast = idx === lines.length - 1;
      return indent + line + (isLast ? "" : ` ${contChar}\n`);
    })
    .join("");
}
