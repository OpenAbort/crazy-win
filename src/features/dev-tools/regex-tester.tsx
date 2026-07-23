import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { testRegex, type RegexResult } from "@/features/dev-tools/regex-tester-logic";

const EMPTY_RESULT: RegexResult = { segments: [], matches: [], error: null };

export function RegexTester() {
  const [pattern, setPattern] = useState("");
  const [flags, setFlags] = useState("g");
  const [text, setText] = useState("");
  const [result, setResult] = useState<RegexResult>(EMPTY_RESULT);

  useEffect(() => {
    const timer = setTimeout(() => setResult(testRegex(pattern, flags, text)), 300);
    return () => clearTimeout(timer);
  }, [pattern, flags, text]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-background px-6 py-4">
        <h1 className="font-heading text-lg font-medium">Regex Tester</h1>
        <p className="text-sm text-muted-foreground">Test a regular expression against sample text</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        {result.error && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Invalid pattern</AlertTitle>
            <AlertDescription>{result.error}</AlertDescription>
          </Alert>
        )}

        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">/</span>
          <Input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            spellCheck={false}
            placeholder="pattern"
            className="flex-1 font-mono text-sm"
          />
          <span className="font-mono text-sm text-muted-foreground">/</span>
          <Input
            value={flags}
            onChange={(e) => setFlags(e.target.value)}
            spellCheck={false}
            placeholder="gi"
            className="w-16 font-mono text-sm"
          />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase">Test string</span>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              placeholder="Paste text to test against..."
              className="h-full min-h-0 resize-none font-mono text-xs"
            />
          </div>
          <div className="flex min-h-0 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase">
              Matches ({result.matches.length})
            </span>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-lg border p-2">
              <div className="rounded-md border bg-transparent px-2.5 py-2 font-mono text-xs whitespace-pre-wrap break-words">
                {result.segments.length > 0 ? (
                  result.segments.map((seg, i) => (
                    <span key={i} className={seg.isMatch ? "rounded-sm bg-yellow-300/60 dark:bg-yellow-500/40" : ""}>
                      {seg.text}
                    </span>
                  ))
                ) : (
                  <span className="text-muted-foreground">Highlighted matches appear here</span>
                )}
              </div>
              {result.matches.map((m, i) => (
                <div key={i} className="rounded-md border px-2.5 py-1.5 text-xs">
                  <div className="font-mono font-semibold">
                    [{i}] {m.fullMatch || "(empty match)"}{" "}
                    <span className="text-muted-foreground">@{m.index}</span>
                  </div>
                  {m.groups.length > 0 && (
                    <div className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                      {m.groups.map((g, gi) => (
                        <div key={gi} className="font-mono">
                          group {gi + 1}: {g ?? "(undefined)"}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
