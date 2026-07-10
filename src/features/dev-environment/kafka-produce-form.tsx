import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Redo2, Send, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { KafkaTopicSummary } from "@/features/dev-environment/kafka-manager-logic";
import {
  addKafkaProduceHistoryEntry,
  getKafkaProduceHistory,
  type KafkaProduceHistoryEntry,
} from "@/features/dev-environment/kafka-store";

export function KafkaProduceForm({
  brokers,
  topics,
  initialTopic,
}: {
  brokers: string;
  topics: KafkaTopicSummary[];
  initialTopic: string;
}) {
  const [topic, setTopic] = useState(initialTopic);
  const [partition, setPartition] = useState("0");
  const [key, setKey] = useState("");
  const [nullValue, setNullValue] = useState(false);
  const [value, setValue] = useState("");
  const [headers, setHeaders] = useState<[string, string][]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [history, setHistory] = useState<KafkaProduceHistoryEntry[]>([]);

  useEffect(() => {
    setTopic(initialTopic);
  }, [initialTopic]);

  useEffect(() => {
    void loadHistory();
  }, []);

  async function loadHistory() {
    setHistory(await getKafkaProduceHistory());
  }

  async function handleProduce(entryOverride?: KafkaProduceHistoryEntry) {
    const payload = entryOverride ?? {
      topic,
      partition: Number(partition) || 0,
      key: key.trim() ? key : null,
      value: nullValue ? null : value,
      headers: headers.filter(([k]) => k.trim()),
    };

    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const offset = await invoke<number>("kafka_produce", {
        brokers,
        topic: payload.topic,
        partition: payload.partition,
        key: payload.key,
        value: payload.value,
        headers: payload.headers,
      });
      setStatus(`Produced at offset ${offset}`);
      await addKafkaProduceHistoryEntry({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        topic: payload.topic,
        partition: payload.partition,
        key: payload.key,
        value: payload.value,
        headers: payload.headers,
      });
      await loadHistory();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleReuse(entry: KafkaProduceHistoryEntry) {
    setTopic(entry.topic);
    setPartition(String(entry.partition));
    setKey(entry.key ?? "");
    setNullValue(entry.value === null);
    setValue(entry.value ?? "");
    setHeaders(entry.headers);
  }

  const selectedTopic = topics.find((t) => t.name === topic);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to produce</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {status && <p className="text-xs text-emerald-500">{status}</p>}

      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <div className="flex gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label>Topic</Label>
            <Select value={topic} onValueChange={setTopic}>
              <SelectTrigger>
                <SelectValue placeholder="Topic" />
              </SelectTrigger>
              <SelectContent>
                {topics.map((t) => (
                  <SelectItem key={t.name} value={t.name}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex w-32 flex-col gap-1.5">
            <Label>Partition</Label>
            <Select value={partition} onValueChange={setPartition}>
              <SelectTrigger>
                <SelectValue placeholder="Partition" />
              </SelectTrigger>
              <SelectContent>
                {(selectedTopic?.partitions ?? [0]).map((p) => (
                  <SelectItem key={p} value={String(p)}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Key (optional)</Label>
          <Input value={key} onChange={(e) => setKey(e.target.value)} className="font-mono text-sm" />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label>Value</Label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch checked={nullValue} onCheckedChange={setNullValue} size="sm" />
              Null value (tombstone)
            </label>
          </div>
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={nullValue}
            className="min-h-24 font-mono text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Headers</Label>
          {headers.map(([k, v], i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input
                value={k}
                onChange={(e) => setHeaders(headers.map((h, j) => (j === i ? [e.target.value, h[1]] : h)))}
                placeholder="key"
                className="font-mono text-xs"
              />
              <Input
                value={v}
                onChange={(e) => setHeaders(headers.map((h, j) => (j === i ? [h[0], e.target.value] : h)))}
                placeholder="value"
                className="font-mono text-xs"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setHeaders(headers.filter((_, j) => j !== i))}
                aria-label="Remove header"
              >
                <X />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setHeaders([...headers, ["", ""]])}
          >
            <Plus />
            Add header
          </Button>
        </div>

        <Button onClick={() => void handleProduce()} disabled={busy || !topic} className="self-start">
          <Send />
          Produce
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-sm font-medium">History</h3>
        {history.length === 0 && <p className="text-sm text-muted-foreground">No produce history yet.</p>}
        <div className="flex flex-col gap-1.5">
          {history.map((entry) => (
            <div key={entry.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5">
              <Badge variant="outline">{entry.topic}</Badge>
              <Badge variant="outline">p{entry.partition}</Badge>
              <div className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                {entry.key ? `${entry.key}: ` : ""}
                {entry.value ?? "<null>"}
              </div>
              <span className="text-xs text-muted-foreground">{new Date(entry.timestamp).toLocaleTimeString()}</span>
              <Button variant="ghost" size="sm" onClick={() => handleReuse(entry)}>
                Reuse
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => void handleProduce(entry)} aria-label="Send again">
                <Redo2 />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
