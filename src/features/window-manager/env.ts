/**
 * Parsing and editing helpers for environment variables, serialized as a
 * synthesized `NAME=VALUE` text view of live registry state. Unlike the hosts
 * file, there's no underlying file to preserve formatting for — this content
 * is fully re-derived from the registry on every load and re-parsed in full
 * on every save.
 */

export interface EnvVar {
  /** Index of this variable's line within the current content string. */
  lineIndex: number;
  name: string;
  value: string;
}

/** Parse a single "NAME=VALUE" line, splitting on the FIRST '=' only, since
 * values may legitimately contain '='. Blank or malformed (no '=', empty
 * name) lines are skipped. */
function parseLine(raw: string): Omit<EnvVar, "lineIndex"> | null {
  if (raw.trim() === "") return null;
  const eq = raw.indexOf("=");
  if (eq === -1) return null;
  const name = raw.slice(0, eq).trim();
  const value = raw.slice(eq + 1);
  if (!name) return null;
  return { name, value };
}

export function parseEnvVars(content: string): EnvVar[] {
  const vars: EnvVar[] = [];
  content.split("\n").forEach((raw, lineIndex) => {
    const parsed = parseLine(raw);
    if (parsed) vars.push({ lineIndex, ...parsed });
  });
  return vars;
}

export function filterEnvVars(vars: EnvVar[], query: string): EnvVar[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return vars;
  return vars.filter((v) =>
    `${v.name} ${v.value}`.toLowerCase().includes(needle),
  );
}

/** Render a variable back into a single "NAME=VALUE" line. */
export function formatEnvVar(entry: Omit<EnvVar, "lineIndex">): string {
  return `${entry.name}=${entry.value}`;
}

/** Replace the line at `lineIndex` with the serialized variable. */
export function replaceEnvVar(
  content: string,
  lineIndex: number,
  entry: Omit<EnvVar, "lineIndex">,
): string {
  const lines = content.split("\n");
  lines[lineIndex] = formatEnvVar(entry);
  return lines.join("\n");
}

/** Remove the line at `lineIndex`. */
export function removeEnvLine(content: string, lineIndex: number): string {
  const lines = content.split("\n");
  lines.splice(lineIndex, 1);
  return lines.join("\n");
}

/** Append a new variable as the last line. */
export function appendEnvVar(
  content: string,
  entry: Omit<EnvVar, "lineIndex">,
): string {
  const line = formatEnvVar(entry);
  if (content === "" || content.endsWith("\n")) {
    return `${content}${line}\n`;
  }
  return `${content}\n${line}\n`;
}
