import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, Search, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatContent, type FormatLanguage } from "@/features/dev-tools/formatter-logic";
import { applySearch, tokenize, type TokenKind } from "@/features/dev-tools/formatter-highlight";

const PLACEHOLDERS: Record<FormatLanguage, string> = {
  json: '{\n  "key": "value"\n}',
  xml: "<root>\n  <child>value</child>\n</root>",
  yaml: "key: value",
};

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

export function Formatter() {
  const [language, setLanguage] = useState<FormatLanguage>("json");
  const [input, setInput] = useState("");
  const [minify, setMinify] = useState(false);
  const [result, setResult] = useState<{ output: string; error: string | null }>({
    output: "",
    error: null,
  });
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState("");
  const [currentMatch, setCurrentMatch] = useState(0);
  const currentMatchRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setResult(formatContent(language, input, minify));
    }, 300);
    return () => clearTimeout(timer);
  }, [language, input, minify]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    setCurrentMatch(0);
  }, [query, result.output]);

  useEffect(() => {
    currentMatchRef.current?.scrollIntoView({ block: "nearest" });
  }, [currentMatch]);

  const { segments, matchCount } = useMemo(
    () => applySearch(tokenize(language, result.output), query),
    [language, result.output, query],
  );

  function stepMatch(delta: number) {
    if (matchCount === 0) return;
    setCurrentMatch((prev) => (prev + delta + matchCount) % matchCount);
  }

  async function copyOutput() {
    await navigator.clipboard.writeText(result.output);
    setCopied(true);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b bg-background px-6 py-4">
        <div>
          <h1 className="font-heading text-lg font-medium">Formatter</h1>
          <p className="text-sm text-muted-foreground">
            Pretty-print and minify JSON, XML, and YAML
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Tabs value={language} onValueChange={(v) => setLanguage(v as FormatLanguage)}>
            <TabsList>
              <TabsTrigger value="json">JSON</TabsTrigger>
              <TabsTrigger value="xml">XML</TabsTrigger>
              <TabsTrigger value="yaml">YAML</TabsTrigger>
            </TabsList>
          </Tabs>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch
              checked={minify}
              onCheckedChange={setMinify}
              disabled={language === "yaml"}
            />
            Minify
          </label>
          <Button
            variant="outline"
            onClick={() => void copyOutput()}
            disabled={!result.output || !!result.error}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        {result.error && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Couldn't format input</AlertTitle>
            <AlertDescription>{result.error}</AlertDescription>
          </Alert>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase">Input</span>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
              placeholder={PLACEHOLDERS[language]}
              className="h-full min-h-0 resize-none font-mono text-xs"
            />
          </div>
          <div className="flex min-h-0 flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground uppercase">Output</span>
              <div className="flex items-center gap-1">
                <div className="relative">
                  <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search output..."
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
                  onClick={() => stepMatch(-1)}
                >
                  <ChevronUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={matchCount === 0}
                  onClick={() => stepMatch(1)}
                >
                  <ChevronDown />
                </Button>
              </div>
            </div>
            <div className="h-full min-h-0 flex-1 overflow-auto rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-xs whitespace-pre-wrap break-words">
              {result.output ? (
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
                <span className="text-muted-foreground">Formatted output appears here</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
