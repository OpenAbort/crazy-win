import type { FormatLanguage } from "@/features/dev-tools/formatter-logic";

export type TokenKind =
  | "key"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "punct"
  | "tag"
  | "attr"
  | "comment"
  | "text";

export interface Token {
  text: string;
  kind: TokenKind;
}

export interface HighlightSegment {
  text: string;
  kind: TokenKind;
  isMatch: boolean;
  matchIndex: number | null;
}

const JSON_TOKEN_RE = /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}[\],:]|\s+/g;

function tokenizeJson(output: string): Token[] {
  const tokens: Token[] = [];
  let lastIndex = 0;
  for (const match of output.matchAll(JSON_TOKEN_RE)) {
    const text = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) tokens.push({ text: output.slice(lastIndex, index), kind: "text" });
    lastIndex = index + text.length;

    if (/^\s+$/.test(text)) {
      tokens.push({ text, kind: "text" });
    } else if (text[0] === '"') {
      const rest = output.slice(lastIndex);
      const isKey = /^\s*:/.test(rest);
      tokens.push({ text, kind: isKey ? "key" : "string" });
    } else if (text === "true" || text === "false") {
      tokens.push({ text, kind: "boolean" });
    } else if (text === "null") {
      tokens.push({ text, kind: "null" });
    } else if (/^[{}[\],:]$/.test(text)) {
      tokens.push({ text, kind: "punct" });
    } else {
      tokens.push({ text, kind: "number" });
    }
  }
  if (lastIndex < output.length) tokens.push({ text: output.slice(lastIndex), kind: "text" });
  return tokens;
}

function tokenizeXmlTag(tag: string): Token[] {
  if (tag.startsWith("<!--")) return [{ text: tag, kind: "comment" }];

  const tokens: Token[] = [];
  const ATTR_RE = /([\w:.-]+)(=)("(?:[^"]*)"|'(?:[^']*)')/g;
  const inner = tag.slice(1, tag.endsWith("/>") ? -2 : -1);
  const isClosing = inner.startsWith("/");
  const nameMatch = /^\/?[\w:.-]+/.exec(inner);
  const name = nameMatch ? nameMatch[0] : "";

  tokens.push({ text: "<" + (isClosing ? "/" : ""), kind: "punct" });
  tokens.push({ text: name.replace(/^\//, ""), kind: "tag" });

  let cursor = name.length;
  let lastIndex = cursor;
  ATTR_RE.lastIndex = cursor;
  for (const match of inner.slice(cursor).matchAll(/([\w:.-]+)(\s*=\s*)("(?:[^"]*)"|'(?:[^']*)')/g)) {
    const index = cursor + (match.index ?? 0);
    if (index > lastIndex) tokens.push({ text: inner.slice(lastIndex, index), kind: "text" });
    tokens.push({ text: match[1], kind: "attr" });
    tokens.push({ text: match[2], kind: "text" });
    tokens.push({ text: match[3], kind: "string" });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < inner.length) tokens.push({ text: inner.slice(lastIndex), kind: "text" });

  tokens.push({ text: (tag.endsWith("/>") ? "/>" : ">"), kind: "punct" });
  return tokens;
}

function tokenizeXml(output: string): Token[] {
  const tokens: Token[] = [];
  const TAG_RE = /<!--[\s\S]*?-->|<[^>]*>/g;
  let lastIndex = 0;
  for (const match of output.matchAll(TAG_RE)) {
    const text = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) tokens.push({ text: output.slice(lastIndex, index), kind: "text" });
    tokens.push(...tokenizeXmlTag(text));
    lastIndex = index + text.length;
  }
  if (lastIndex < output.length) tokens.push({ text: output.slice(lastIndex), kind: "text" });
  return tokens;
}

const YAML_VALUE_KIND = (value: string): TokenKind => {
  if (value === "true" || value === "false") return "boolean";
  if (value === "null" || value === "~") return "null";
  if (/^-?\d+(\.\d+)?$/.test(value)) return "number";
  return "string";
};

function tokenizeYamlLine(line: string): Token[] {
  const tokens: Token[] = [];
  const leadingMatch = /^(\s*)/.exec(line);
  const leading = leadingMatch ? leadingMatch[1] : "";
  let rest = line.slice(leading.length);
  if (leading) tokens.push({ text: leading, kind: "text" });

  if (rest.trim().startsWith("#")) {
    tokens.push({ text: rest, kind: "comment" });
    return tokens;
  }

  let dashPrefix = "";
  const dashMatch = /^(-\s+)/.exec(rest);
  if (dashMatch) {
    dashPrefix = dashMatch[1];
    tokens.push({ text: "-", kind: "punct" }, { text: dashPrefix.slice(1), kind: "text" });
    rest = rest.slice(dashPrefix.length);
  }

  const colonMatch = /^([^:#]+?)(:)(\s|$)/.exec(rest);
  if (colonMatch) {
    const key = colonMatch[1];
    const sep = colonMatch[3];
    tokens.push({ text: key, kind: "key" });
    tokens.push({ text: ":", kind: "punct" });
    const valueStart = key.length + 1;
    const value = rest.slice(valueStart);
    if (value.trim() === "") {
      tokens.push({ text: value, kind: "text" });
    } else {
      const spacing = /^\s*/.exec(value)?.[0] ?? "";
      const scalar = value.slice(spacing.length);
      if (spacing) tokens.push({ text: spacing, kind: "text" });
      if (scalar) tokens.push({ text: scalar, kind: YAML_VALUE_KIND(scalar) });
    }
    void sep;
  } else if (rest.length > 0) {
    tokens.push({ text: rest, kind: YAML_VALUE_KIND(rest) });
  }

  return tokens;
}

function tokenizeYaml(output: string): Token[] {
  const lines = output.split("\n");
  const tokens: Token[] = [];
  lines.forEach((line, i) => {
    tokens.push(...tokenizeYamlLine(line));
    if (i < lines.length - 1) tokens.push({ text: "\n", kind: "text" });
  });
  return tokens;
}

export function tokenize(language: FormatLanguage, output: string): Token[] {
  if (!output) return [];
  switch (language) {
    case "json":
      return tokenizeJson(output);
    case "xml":
      return tokenizeXml(output);
    case "yaml":
      return tokenizeYaml(output);
  }
}

export function applySearch(
  tokens: Token[],
  query: string,
): { segments: HighlightSegment[]; matchCount: number } {
  if (!query) {
    return {
      segments: tokens.map((t) => ({ ...t, isMatch: false, matchIndex: null })),
      matchCount: 0,
    };
  }

  const fullText = tokens.map((t) => t.text).join("");
  const lowerFull = fullText.toLowerCase();
  const lowerQuery = query.toLowerCase();

  const matches: { start: number; end: number }[] = [];
  let searchFrom = 0;
  while (true) {
    const found = lowerFull.indexOf(lowerQuery, searchFrom);
    if (found === -1) break;
    matches.push({ start: found, end: found + lowerQuery.length });
    searchFrom = found + lowerQuery.length;
  }

  const segments: HighlightSegment[] = [];
  let pos = 0;
  let matchPtr = 0;

  for (const token of tokens) {
    const tokenEnd = pos + token.text.length;
    let cursor = pos;

    while (cursor < tokenEnd) {
      while (matchPtr < matches.length && matches[matchPtr].end <= cursor) matchPtr++;
      const m = matches[matchPtr];

      if (!m || m.start >= tokenEnd) {
        segments.push({ text: fullText.slice(cursor, tokenEnd), kind: token.kind, isMatch: false, matchIndex: null });
        cursor = tokenEnd;
        break;
      }

      if (m.start > cursor) {
        segments.push({ text: fullText.slice(cursor, m.start), kind: token.kind, isMatch: false, matchIndex: null });
        cursor = m.start;
      }

      const segEnd = Math.min(m.end, tokenEnd);
      segments.push({ text: fullText.slice(cursor, segEnd), kind: token.kind, isMatch: true, matchIndex: matchPtr });
      cursor = segEnd;
      if (segEnd >= m.end) matchPtr++;
    }

    pos = tokenEnd;
  }

  return { segments, matchCount: matches.length };
}
