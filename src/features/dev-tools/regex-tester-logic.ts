export interface RegexSegment {
  text: string;
  isMatch: boolean;
}

export interface RegexMatch {
  index: number;
  fullMatch: string;
  groups: string[];
}

export interface RegexResult {
  segments: RegexSegment[];
  matches: RegexMatch[];
  error: string | null;
}

const MAX_MATCHES = 5000;

export function testRegex(pattern: string, flags: string, text: string): RegexResult {
  if (!pattern || !text) {
    return { segments: text ? [{ text, isMatch: false }] : [], matches: [], error: null };
  }

  let regex: RegExp;
  try {
    const normalizedFlags = flags.includes("g") ? flags : `${flags}g`;
    regex = new RegExp(pattern, normalizedFlags);
  } catch (e) {
    return { segments: [{ text, isMatch: false }], matches: [], error: e instanceof Error ? e.message : String(e) };
  }

  const segments: RegexSegment[] = [];
  const matches: RegexMatch[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null && matches.length < MAX_MATCHES) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), isMatch: false });
    }
    segments.push({ text: match[0], isMatch: true });
    matches.push({ index: match.index, fullMatch: match[0], groups: match.slice(1) });
    lastIndex = match.index + match[0].length;
    if (match[0].length === 0) regex.lastIndex++; // avoid an infinite loop on a zero-length match
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isMatch: false });
  }

  return { segments, matches, error: null };
}
