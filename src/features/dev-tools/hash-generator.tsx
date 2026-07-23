import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { computeHashes, type HashResult } from "@/features/dev-tools/hash-generator-logic";

export function HashGenerator() {
  const [input, setInput] = useState("");
  const [hashes, setHashes] = useState<HashResult[]>([]);
  const [copiedAlgorithm, setCopiedAlgorithm] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      void computeHashes(input).then(setHashes);
    }, 300);
    return () => clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    if (!copiedAlgorithm) return;
    const timer = setTimeout(() => setCopiedAlgorithm(null), 1500);
    return () => clearTimeout(timer);
  }, [copiedAlgorithm]);

  async function copyHash(algorithm: string, hex: string) {
    await navigator.clipboard.writeText(hex);
    setCopiedAlgorithm(algorithm);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-background px-6 py-4">
        <h1 className="font-heading text-lg font-medium">Hash Generator</h1>
        <p className="text-sm text-muted-foreground">Compute MD5, SHA-1, SHA-256, SHA-384, and SHA-512 hashes</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        <div className="flex min-h-0 shrink-0 flex-col gap-1.5" style={{ height: "35%" }}>
          <span className="text-xs font-medium text-muted-foreground uppercase">Input</span>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            placeholder="Type or paste text to hash..."
            className="h-full min-h-0 resize-none font-mono text-xs"
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {hashes.map((h) => (
            <div key={h.algorithm} className="flex items-center gap-2 rounded-lg border px-3 py-2">
              <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground uppercase">{h.algorithm}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{h.hex}</span>
              <Button variant="ghost" size="icon-sm" onClick={() => void copyHash(h.algorithm, h.hex)} aria-label={`Copy ${h.algorithm}`}>
                {copiedAlgorithm === h.algorithm ? <Check /> : <Copy />}
              </Button>
            </div>
          ))}
          {hashes.length === 0 && (
            <div className="flex h-full items-center justify-center rounded-lg border text-center text-sm text-muted-foreground">
              Hashes appear here
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
