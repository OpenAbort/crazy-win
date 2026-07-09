import * as Diff from "diff";

export type DiffRowKind = "unchanged" | "added" | "removed" | "changed";

export interface InlineSegment {
  text: string;
  changed: boolean;
}

export interface DiffRow {
  kind: DiffRowKind;
  leftText?: string;
  rightText?: string;
  leftSegments?: InlineSegment[];
  rightSegments?: InlineSegment[];
  leftLineNo?: number;
  rightLineNo?: number;
}

export interface DiffComputation {
  rows: DiffRow[];
  stats: { added: number; removed: number };
  identical: boolean;
}

export interface UnifiedLine {
  marker: "+" | "-" | " ";
  text: string;
  segments?: InlineSegment[];
  tone: "unchanged" | "added" | "removed";
  lineNo?: number;
}

/** Split a diffLines chunk value into its individual lines, dropping the
 * trailing empty string produced by a final newline. */
function splitLines(value: string): string[] {
  const lines = value.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function refineLinePair(
  leftLine: string,
  rightLine: string,
): { leftSegments: InlineSegment[]; rightSegments: InlineSegment[] } {
  const parts = Diff.diffWordsWithSpace(leftLine, rightLine);
  const leftSegments: InlineSegment[] = [];
  const rightSegments: InlineSegment[] = [];
  for (const part of parts) {
    if (part.removed) {
      leftSegments.push({ text: part.value, changed: true });
    } else if (part.added) {
      rightSegments.push({ text: part.value, changed: true });
    } else {
      leftSegments.push({ text: part.value, changed: false });
      rightSegments.push({ text: part.value, changed: false });
    }
  }
  return { leftSegments, rightSegments };
}

export function computeDiff(original: string, changed: string): DiffComputation {
  if (original === "" && changed === "") {
    return { rows: [], stats: { added: 0, removed: 0 }, identical: false };
  }

  // Normalize trailing newlines so a line that's identical except for being
  // the last line of a shorter input doesn't get spuriously treated as
  // changed (diffLines is newline-boundary sensitive at end of input).
  const normalize = (s: string) => (s === "" || s.endsWith("\n") ? s : `${s}\n`);
  const parts = Diff.diffLines(normalize(original), normalize(changed));
  const rows: DiffRow[] = [];
  let leftLineNo = 1;
  let rightLineNo = 1;
  let added = 0;
  let removed = 0;
  let i = 0;

  while (i < parts.length) {
    const part = parts[i];

    if (!part.added && !part.removed) {
      for (const line of splitLines(part.value)) {
        rows.push({
          kind: "unchanged",
          leftText: line,
          rightText: line,
          leftLineNo: leftLineNo++,
          rightLineNo: rightLineNo++,
        });
      }
      i += 1;
      continue;
    }

    let removedLines: string[] = [];
    let addedLines: string[] = [];
    if (part.removed) {
      removedLines = splitLines(part.value);
      i += 1;
      if (i < parts.length && parts[i].added) {
        addedLines = splitLines(parts[i].value);
        i += 1;
      }
    } else if (part.added) {
      addedLines = splitLines(part.value);
      i += 1;
    }

    added += addedLines.length;
    removed += removedLines.length;

    const pairCount = Math.min(removedLines.length, addedLines.length);

    for (let k = 0; k < pairCount; k++) {
      const { leftSegments, rightSegments } = refineLinePair(removedLines[k], addedLines[k]);
      rows.push({
        kind: "changed",
        leftText: removedLines[k],
        rightText: addedLines[k],
        leftSegments,
        rightSegments,
        leftLineNo: leftLineNo++,
        rightLineNo: rightLineNo++,
      });
    }
    for (let k = pairCount; k < removedLines.length; k++) {
      rows.push({ kind: "removed", leftText: removedLines[k], leftLineNo: leftLineNo++ });
    }
    for (let k = pairCount; k < addedLines.length; k++) {
      rows.push({ kind: "added", rightText: addedLines[k], rightLineNo: rightLineNo++ });
    }
  }

  const identical = added === 0 && removed === 0 && original !== "" && changed !== "";
  return { rows, stats: { added, removed }, identical };
}

/** Flatten rows for the Unified view: a "changed" row becomes a removed line
 * followed by an added line. */
export function toUnifiedLines(rows: DiffRow[]): UnifiedLine[] {
  const lines: UnifiedLine[] = [];
  for (const row of rows) {
    switch (row.kind) {
      case "unchanged":
        lines.push({ marker: " ", text: row.leftText!, tone: "unchanged", lineNo: row.leftLineNo });
        break;
      case "removed":
        lines.push({ marker: "-", text: row.leftText!, tone: "removed", lineNo: row.leftLineNo });
        break;
      case "added":
        lines.push({ marker: "+", text: row.rightText!, tone: "added", lineNo: row.rightLineNo });
        break;
      case "changed":
        lines.push({
          marker: "-",
          text: row.leftText!,
          segments: row.leftSegments,
          tone: "removed",
          lineNo: row.leftLineNo,
        });
        lines.push({
          marker: "+",
          text: row.rightText!,
          segments: row.rightSegments,
          tone: "added",
          lineNo: row.rightLineNo,
        });
        break;
    }
  }
  return lines;
}
