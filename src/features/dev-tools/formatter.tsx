import { useEffect, useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatContent, type FormatLanguage } from "@/features/dev-tools/formatter-logic";

const PLACEHOLDERS: Record<FormatLanguage, string> = {
  json: '{\n  "key": "value"\n}',
  xml: "<root>\n  <child>value</child>\n</root>",
  yaml: "key: value",
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
            <span className="text-xs font-medium text-muted-foreground uppercase">Output</span>
            <Textarea
              value={result.output}
              readOnly
              spellCheck={false}
              placeholder="Formatted output appears here"
              className="h-full min-h-0 resize-none font-mono text-xs"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
