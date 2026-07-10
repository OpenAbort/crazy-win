import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applySearch, tokenize, type HighlightLanguage, type TokenKind } from "@/features/dev-tools/formatter-highlight";

const TOKEN_CLASSES: Record<TokenKind, string> = {
  key: "text-blue-600 dark:text-blue-400",
  string: "text-emerald-600 dark:text-emerald-400",
  number: "text-orange-600 dark:text-orange-400",
  boolean: "text-purple-600 dark:text-purple-400",
  null: "text-purple-600 dark:text-purple-400",
  punct: "text-muted-foreground",
  tag: "text-blue-600 dark:text-blue-400",
  attr: "text-orange-600 dark:text-orange-400",
  comment: "text-muted-foreground italic",
  text: "",
};

/// Shared search state for a language-highlighted content pane. Lifted out of
/// the pane itself so a single search bar can drive multiple panes (e.g. one
/// toolbar shared between an Inspect tab and a Logs tab).
export function useContentSearch(language: HighlightLanguage, content: string) {
  const [query, setQuery] = useState("");
  const [currentMatch, setCurrentMatch] = useState(0);

  useEffect(() => {
    setCurrentMatch(0);
  }, [query, content]);

  const { segments, matchCount } = useMemo(
    () => applySearch(tokenize(language, content), query),
    [language, content, query],
  );

  function stepMatch(delta: number) {
    if (matchCount === 0) return;
    setCurrentMatch((prev) => (prev + delta + matchCount) % matchCount);
  }

  return { query, setQuery, currentMatch, stepMatch, segments, matchCount };
}

export function SearchToolbar({
  query,
  onQueryChange,
  matchCount,
  currentMatch,
  onStep,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  matchCount: number;
  currentMatch: number;
  onStep: (delta: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <div className="relative">
        <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search..."
          className="h-7 w-40 pl-7 text-xs"
        />
      </div>
      <span className="min-w-10 text-center text-xs text-muted-foreground tabular-nums">
        {matchCount === 0 ? "0/0" : `${currentMatch + 1}/${matchCount}`}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        disabled={matchCount === 0}
        onClick={() => onStep(-1)}
      >
        <ChevronUp />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        disabled={matchCount === 0}
        onClick={() => onStep(1)}
      >
        <ChevronDown />
      </Button>
    </div>
  );
}

export function JsonDetailPane({
  content,
  segments,
  currentMatch,
  emptyLabel = "No data",
}: {
  content: string;
  segments: ReturnType<typeof useContentSearch>["segments"];
  currentMatch: number;
  emptyLabel?: string;
}) {
  const currentMatchRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    currentMatchRef.current?.scrollIntoView({ block: "nearest" });
  }, [currentMatch]);

  return (
    <div className="h-full min-h-0 flex-1 overflow-auto rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-xs whitespace-pre-wrap break-words">
      {content ? (
        segments.map((segment, i) => (
          <span
            key={i}
            ref={segment.isMatch && segment.matchIndex === currentMatch ? currentMatchRef : undefined}
            className={
              (TOKEN_CLASSES[segment.kind] || "") +
              (segment.isMatch
                ? segment.matchIndex === currentMatch
                  ? " bg-orange-400 text-black rounded-sm"
                  : " bg-yellow-300/60 dark:bg-yellow-500/40 rounded-sm"
                : "")
            }
          >
            {segment.text}
          </span>
        ))
      ) : (
        <span className="text-muted-foreground">{emptyLabel}</span>
      )}
    </div>
  );
}
