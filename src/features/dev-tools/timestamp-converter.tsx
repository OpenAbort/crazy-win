import { useState } from "react";
import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fromDateString, fromEpoch, type TimestampResult } from "@/features/dev-tools/timestamp-converter-logic";

const EMPTY_RESULT: TimestampResult = {
  epochSeconds: "",
  epochMillis: "",
  iso: "",
  utc: "",
  local: "",
  relative: "",
  error: null,
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border-b py-2 last:border-b-0">
      <span className="w-28 shrink-0 text-xs font-medium text-muted-foreground uppercase">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-sm">{value || "—"}</span>
    </div>
  );
}

export function TimestampConverter() {
  const [epochText, setEpochText] = useState("");
  const [dateText, setDateText] = useState("");
  const [result, setResult] = useState<TimestampResult>(EMPTY_RESULT);

  function handleEpochChange(value: string) {
    setEpochText(value);
    const r = fromEpoch(value);
    setResult(r);
    if (!r.error && value.trim()) setDateText(r.iso);
  }

  function handleDateChange(value: string) {
    setDateText(value);
    const r = fromDateString(value);
    setResult(r);
    if (!r.error && value.trim()) setEpochText(r.epochSeconds);
  }

  function handleNow() {
    handleEpochChange(String(Math.floor(Date.now() / 1000)));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b bg-background px-6 py-4">
        <div>
          <h1 className="font-heading text-lg font-medium">Timestamp Converter</h1>
          <p className="text-sm text-muted-foreground">Convert between Unix epoch and human-readable dates</p>
        </div>
        <Button variant="outline" onClick={handleNow}>
          Now
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        {result.error && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Couldn't parse input</AlertTitle>
            <AlertDescription>{result.error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase">Epoch (seconds or ms)</span>
            <Input
              value={epochText}
              onChange={(e) => handleEpochChange(e.target.value)}
              spellCheck={false}
              placeholder="1700000000"
              className="font-mono text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase">Date / time (ISO or any parseable format)</span>
            <Input
              value={dateText}
              onChange={(e) => handleDateChange(e.target.value)}
              spellCheck={false}
              placeholder="2023-11-14T22:13:20.000Z"
              className="font-mono text-sm"
            />
          </div>
        </div>

        <div className="rounded-lg border px-3 py-1">
          <Row label="Epoch (s)" value={result.epochSeconds} />
          <Row label="Epoch (ms)" value={result.epochMillis} />
          <Row label="ISO" value={result.iso} />
          <Row label="UTC" value={result.utc} />
          <Row label="Local" value={result.local} />
          <Row label="Relative" value={result.relative} />
        </div>
      </div>
    </div>
  );
}
