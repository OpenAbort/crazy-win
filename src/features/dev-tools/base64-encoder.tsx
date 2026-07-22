import { useEffect, useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { decodeBase64, encodeBase64, type Base64Result } from "@/features/dev-tools/base64-logic";

type Mode = "encode" | "decode";

export function Base64Encoder() {
  const [mode, setMode] = useState<Mode>("encode");
  const [input, setInput] = useState("");
  const [result, setResult] = useState<Base64Result>({ output: "", error: null });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setResult(mode === "encode" ? encodeBase64(input) : decodeBase64(input));
    }, 300);
    return () => clearTimeout(timer);
  }, [mode, input]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copyOutput() {
    await navigator.clipboard.writeText(result.output);
    setCopied(true);
  }

  const inputLabel = mode === "encode" ? "Text" : "Base64";
  const outputLabel = mode === "encode" ? "Base64" : "Text";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b bg-background px-6 py-4">
        <div>
          <h1 className="font-heading text-lg font-medium">Base64 Encoder</h1>
          <p className="text-sm text-muted-foreground">Encode and decode Base64 text</p>
        </div>
        <div className="flex items-center gap-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList>
              <TabsTrigger value="encode">Encode</TabsTrigger>
              <TabsTrigger value="decode">Decode</TabsTrigger>
            </TabsList>
          </Tabs>
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
            <AlertTitle>{mode === "encode" ? "Couldn't encode text" : "Couldn't decode Base64"}</AlertTitle>
            <AlertDescription>{result.error}</AlertDescription>
          </Alert>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase">{inputLabel}</span>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
              placeholder={mode === "encode" ? "Paste text to encode..." : "Paste Base64 to decode..."}
              className="h-full min-h-0 resize-none font-mono text-xs"
            />
          </div>
          <div className="flex min-h-0 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase">{outputLabel}</span>
            <div className="h-full min-h-0 flex-1 overflow-auto rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-xs whitespace-pre-wrap break-words">
              {result.output ? (
                result.output
              ) : (
                <span className="text-muted-foreground">Output appears here</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
