import { useEffect, useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export interface TransformResult {
  output: string;
  error: string | null;
}

export interface TransformMode {
  value: string;
  label: string;
  inputLabel: string;
  outputLabel: string;
  placeholder: string;
  errorTitle: string;
  transform: (input: string) => TransformResult;
}

/// Generic shell for a "paste text, pick a mode, see a live transformed
/// result" dev-tool — the shared shape behind the Base64 Encoder
/// (`base64-encoder.tsx`), reused here so URL Encoder/Decoder, Case
/// Converter, and JSON<->YAML Converter don't each re-implement the same
/// debounced-transform/copy-button/error-alert shell.
export function TextTransformTool({
  title,
  description,
  modes,
}: {
  title: string;
  description: string;
  modes: TransformMode[];
}) {
  const [modeValue, setModeValue] = useState(modes[0].value);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<TransformResult>({ output: "", error: null });
  const [copied, setCopied] = useState(false);

  const mode = modes.find((m) => m.value === modeValue) ?? modes[0];

  useEffect(() => {
    const timer = setTimeout(() => {
      setResult(mode.transform(input));
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b bg-background px-6 py-4">
        <div>
          <h1 className="font-heading text-lg font-medium">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-4">
          <Tabs value={modeValue} onValueChange={setModeValue}>
            <TabsList>
              {modes.map((m) => (
                <TabsTrigger key={m.value} value={m.value}>
                  {m.label}
                </TabsTrigger>
              ))}
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
            <AlertTitle>{mode.errorTitle}</AlertTitle>
            <AlertDescription>{result.error}</AlertDescription>
          </Alert>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase">{mode.inputLabel}</span>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
              placeholder={mode.placeholder}
              className="h-full min-h-0 resize-none font-mono text-xs"
            />
          </div>
          <div className="flex min-h-0 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase">{mode.outputLabel}</span>
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
