import { Fragment, useEffect, useState } from "react";
import { Equal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  computeDiff,
  toUnifiedLines,
  type DiffComputation,
  type DiffRow,
  type InlineSegment,
} from "@/features/dev-tools/text-comparer-logic";

type ViewMode = "split" | "unified";

const emptyComputation: DiffComputation = {
  rows: [],
  stats: { added: 0, removed: 0 },
  identical: false,
};

export function TextComparer() {
  const [original, setOriginal] = useState("");
  const [changed, setChanged] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [computation, setComputation] = useState<DiffComputation>(emptyComputation);

  useEffect(() => {
    const timer = setTimeout(() => {
      setComputation(computeDiff(original, changed));
    }, 300);
    return () => clearTimeout(timer);
  }, [original, changed]);

  const isEmpty = !original.trim() && !changed.trim();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b bg-background px-6 py-4">
        <div>
          <h1 className="font-heading text-lg font-medium">Text Comparer</h1>
          <p className="text-sm text-muted-foreground">
            Diff two blocks of text side by side with line- and character-level highlighting
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs">
            <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400">
              +{computation.stats.added}
            </Badge>
            <Badge variant="outline" className="text-red-600 dark:text-red-400">
              -{computation.stats.removed}
            </Badge>
          </div>
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="split">Split</TabsTrigger>
              <TabsTrigger value="unified">Unified</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        <div className="grid h-48 shrink-0 grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase">Original</span>
            <Textarea
              value={original}
              onChange={(e) => setOriginal(e.target.value)}
              spellCheck={false}
              placeholder="Paste the original text..."
              className="h-full min-h-0 resize-none font-mono text-xs"
            />
          </div>
          <div className="flex min-h-0 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase">Changed</span>
            <Textarea
              value={changed}
              onChange={(e) => setChanged(e.target.value)}
              spellCheck={false}
              placeholder="Paste the changed text..."
              className="h-full min-h-0 resize-none font-mono text-xs"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
          {isEmpty ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Paste text into both boxes to see the diff.
            </div>
          ) : computation.identical ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
              <Equal className="size-6" />
              No differences — the two texts are identical.
            </div>
          ) : viewMode === "split" ? (
            <SplitView rows={computation.rows} />
          ) : (
            <UnifiedView rows={computation.rows} />
          )}
        </div>
      </div>
    </div>
  );
}

function Segments({ segments, tone }: { segments?: InlineSegment[]; tone: "left" | "right" }) {
  if (!segments) return null;
  const strongClass = tone === "left" ? "bg-red-500/40" : "bg-emerald-500/40";
  return (
    <>
      {segments.map((seg, i) => (
        <span key={i} className={cn(seg.changed && strongClass)}>
          {seg.text}
        </span>
      ))}
    </>
  );
}

function SplitView({ rows }: { rows: DiffRow[] }) {
  return (
    <div className="grid grid-cols-2 font-mono text-xs">
      {rows.map((row, i) => (
        <Fragment key={i}>
          <div
            className={cn(
              "px-3 py-0.5 break-all whitespace-pre-wrap",
              row.kind === "removed" && "bg-red-500/15",
              row.kind === "changed" && "bg-red-500/15",
            )}
          >
            {row.leftSegments ? (
              <Segments segments={row.leftSegments} tone="left" />
            ) : (
              row.leftText ?? " "
            )}
          </div>
          <div
            className={cn(
              "px-3 py-0.5 break-all whitespace-pre-wrap",
              row.kind === "added" && "bg-emerald-500/15",
              row.kind === "changed" && "bg-emerald-500/15",
            )}
          >
            {row.rightSegments ? (
              <Segments segments={row.rightSegments} tone="right" />
            ) : (
              row.rightText ?? " "
            )}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

function UnifiedView({ rows }: { rows: DiffRow[] }) {
  const lines = toUnifiedLines(rows);
  return (
    <div className="font-mono text-xs">
      {lines.map((line, i) => (
        <div
          key={i}
          className={cn(
            "flex gap-2 px-3 py-0.5 break-all whitespace-pre-wrap",
            line.tone === "removed" && "bg-red-500/15",
            line.tone === "added" && "bg-emerald-500/15",
          )}
        >
          <span className="w-4 shrink-0 select-none text-muted-foreground">{line.marker}</span>
          <span>
            {line.segments ? (
              <Segments
                segments={line.segments}
                tone={line.tone === "removed" ? "left" : "right"}
              />
            ) : (
              line.text
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
