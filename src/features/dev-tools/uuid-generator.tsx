import { useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  generateRandomStrings,
  generateUuids,
  type RandomStringCharset,
} from "@/features/dev-tools/uuid-generator-logic";

type Mode = "uuid" | "random";

const COUNT_OPTIONS = [1, 5, 10, 25];

export function UuidGenerator() {
  const [mode, setMode] = useState<Mode>("uuid");
  const [count, setCount] = useState(5);
  const [length, setLength] = useState(16);
  const [charset, setCharset] = useState<RandomStringCharset>("alphanumeric");
  const [values, setValues] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  function generate() {
    setValues(mode === "uuid" ? generateUuids(count) : generateRandomStrings(count, length, charset));
    setCopiedIndex(null);
    setCopiedAll(false);
  }

  async function copyOne(index: number, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 1500);
  }

  async function copyAll() {
    await navigator.clipboard.writeText(values.join("\n"));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b bg-background px-6 py-4">
        <div>
          <h1 className="font-heading text-lg font-medium">UUID / Random String Generator</h1>
          <p className="text-sm text-muted-foreground">Generate UUIDs or random strings</p>
        </div>
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList>
            <TabsTrigger value="uuid">UUID v4</TabsTrigger>
            <TabsTrigger value="random">Random String</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase">Count</span>
          <Select value={String(count)} onValueChange={(v) => setCount(Number(v))}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNT_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {mode === "random" && (
            <>
              <span className="ml-2 text-xs font-medium text-muted-foreground uppercase">Length</span>
              <Input
                type="number"
                min={1}
                max={256}
                value={length}
                onChange={(e) => setLength(Math.max(1, Math.min(256, Number(e.target.value) || 1)))}
                className="w-20"
              />
              <span className="ml-2 text-xs font-medium text-muted-foreground uppercase">Charset</span>
              <Select value={charset} onValueChange={(v) => setCharset(v as RandomStringCharset)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alphanumeric">Alphanumeric</SelectItem>
                  <SelectItem value="hex">Hex</SelectItem>
                  <SelectItem value="alphanumeric-symbols">Alphanumeric + symbols</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}

          <Button onClick={generate} className="ml-2">
            <RefreshCw />
            Generate
          </Button>
          <Button variant="outline" onClick={() => void copyAll()} disabled={values.length === 0}>
            {copiedAll ? <Check /> : <Copy />}
            {copiedAll ? "Copied" : "Copy all"}
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto rounded-lg border p-2">
          {values.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
              Click Generate to create values
            </div>
          ) : (
            values.map((value, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5">
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{value}</span>
                <Button variant="ghost" size="icon-sm" onClick={() => void copyOne(i, value)} aria-label="Copy">
                  {copiedIndex === i ? <Check /> : <Copy />}
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
