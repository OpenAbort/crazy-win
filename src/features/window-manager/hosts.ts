/**
 * Parsing and editing helpers for the system hosts file.
 *
 * The raw file text is always the source of truth. `parseHosts` derives a
 * structured view of the mapping lines (keeping each entry's source line
 * index), and the mutation helpers rewrite the raw text in place so comments,
 * blank lines, and formatting of untouched lines are preserved.
 */

export interface HostEntry {
  /** Index of this entry's line within the raw file (0-based). */
  lineIndex: number;
  /** Whether the entry is active (false = commented out with a leading #). */
  enabled: boolean;
  ip: string;
  hostnames: string[];
  /** Trailing inline comment text, without the leading '#'. */
  comment: string;
}

/** Loose check for an IPv4 or IPv6 address token. */
function isIpAddress(token: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(token)) {
    return token.split(".").every((part) => Number(part) <= 255);
  }
  // IPv6: contains a colon and only hex digits / colons.
  return token.includes(":") && /^[0-9a-fA-F:]+$/.test(token);
}

/** Parse a single line into a host entry, or null if it isn't a mapping. */
function parseEntryLine(raw: string): Omit<HostEntry, "lineIndex"> | null {
  let line = raw.trim();
  if (!line) return null;

  let enabled = true;
  if (line.startsWith("#")) {
    enabled = false;
    line = line.replace(/^#+\s*/, "");
    if (!line) return null;
  }

  // Peel off any trailing inline comment.
  let comment = "";
  const hashIndex = line.indexOf("#");
  if (hashIndex !== -1) {
    comment = line.slice(hashIndex + 1).trim();
    line = line.slice(0, hashIndex).trim();
  }

  const parts = line.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;

  const [ip, ...hostnames] = parts;
  if (!isIpAddress(ip)) return null;

  return { enabled, ip, hostnames, comment };
}

/** Derive the list of host entries from the raw file text. */
export function parseHosts(content: string): HostEntry[] {
  const entries: HostEntry[] = [];
  content.split("\n").forEach((raw, lineIndex) => {
    const parsed = parseEntryLine(raw);
    if (parsed) entries.push({ lineIndex, ...parsed });
  });
  return entries;
}

/** A host mapping row in the structured Entries view. */
export type EntryItem = { kind: "entry" } & HostEntry;

/** A `##` section-header comment shown as a read-only divider. */
export interface SectionItem {
  kind: "section";
  lineIndex: number;
  /** Header text with the leading '#' characters stripped. */
  text: string;
}

export type HostsItem = EntryItem | SectionItem;

/**
 * Derive an ordered list of entries and `##` section headers from the raw
 * file text. Host mappings (including disabled `# ip host` lines) are parsed
 * first, so a leading `#` only counts as a section header when the line is a
 * genuine `##`-style comment. Single-`#` comments, blanks, and stray text are
 * left out of the structured view (they remain in the raw file).
 */
export function parseHostItems(content: string): HostsItem[] {
  const items: HostsItem[] = [];
  content.split("\n").forEach((raw, lineIndex) => {
    const entry = parseEntryLine(raw);
    if (entry) {
      items.push({ kind: "entry", lineIndex, ...entry });
      return;
    }
    const match = raw.trim().match(/^#{2,}\s*(.+)$/);
    if (match) {
      items.push({ kind: "section", lineIndex, text: match[1].trim() });
    }
  });
  return items;
}

/**
 * Filter the structured items by a search query. An empty query returns the
 * items unchanged (full view with sections). A non-empty query keeps only the
 * entries whose IP, hostname, or comment contains it (case-insensitive) and
 * drops section headers, so results read as a flat filtered list.
 */
export function filterHostItems(items: HostsItem[], query: string): HostsItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) => {
    if (item.kind !== "entry") return false;
    const haystack = [item.ip, ...item.hostnames, item.comment]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

/** Render a host entry back into a single hosts-file line. */
export function formatEntry(entry: Omit<HostEntry, "lineIndex">): string {
  const mapping = `${entry.ip} ${entry.hostnames.join(" ")}`.trim();
  const withComment = entry.comment ? `${mapping} # ${entry.comment}` : mapping;
  return entry.enabled ? withComment : `# ${withComment}`;
}

/** Replace the line at `lineIndex` with the serialized entry. */
export function replaceEntry(
  content: string,
  lineIndex: number,
  entry: Omit<HostEntry, "lineIndex">,
): string {
  const lines = content.split("\n");
  lines[lineIndex] = formatEntry(entry);
  return lines.join("\n");
}

/** Remove the line at `lineIndex`. */
export function removeLine(content: string, lineIndex: number): string {
  const lines = content.split("\n");
  lines.splice(lineIndex, 1);
  return lines.join("\n");
}

/** Append a new host entry as the last line. */
export function appendEntry(
  content: string,
  entry: Omit<HostEntry, "lineIndex">,
): string {
  const line = formatEntry(entry);
  if (content === "" || content.endsWith("\n")) {
    return `${content}${line}\n`;
  }
  return `${content}\n${line}\n`;
}
