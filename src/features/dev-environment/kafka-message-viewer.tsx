import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Trash2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { JsonDetailPane, SearchToolbar, useContentSearch } from "@/features/dev-environment/json-detail-pane";
import type { KafkaTopicSummary } from "@/features/dev-environment/kafka-manager-logic";

const ALL_PARTITIONS = "__all__";
const MAX_MESSAGES = 500;

interface KafkaMessagePayload {
  streamId: number;
  topic: string;
  message: {
    partition: number;
    offset: number;
    timestamp_ms: number;
    key: string | null;
    value: string | null;
    headers: [string, string][];
  };
}

export function KafkaMessageViewer({ brokers, topic }: { brokers: string; topic: KafkaTopicSummary }) {
  const [partitionFilter, setPartitionFilter] = useState(ALL_PARTITIONS);
  const [live, setLive] = useState(false);
  const [messages, setMessages] = useState<KafkaMessagePayload["message"][]>([]);
  const [error, setError] = useState<string | null>(null);
  const streamIdRef = useRef<number | null>(null);

  const messagesText = useMemo(() => JSON.stringify(messages, null, 2), [messages]);
  const search = useContentSearch("json", messagesText);

  useEffect(() => {
    setMessages([]);
    setPartitionFilter(ALL_PARTITIONS);
    setLive(false);
  }, [topic.name]);

  useEffect(() => {
    const unlistenMessage = listen<KafkaMessagePayload>("kafka-message", (event) => {
      if (event.payload.streamId !== streamIdRef.current) return;
      setMessages((prev) => {
        const next = [...prev, event.payload.message];
        return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next;
      });
    });
    const unlistenClosed = listen<number>("kafka-stream-closed", (event) => {
      if (event.payload === streamIdRef.current) {
        streamIdRef.current = null;
        setLive(false);
      }
    });
    const unlistenError = listen<string>("kafka-stream-error", (event) => {
      setError(event.payload);
    });
    return () => {
      void unlistenMessage.then((f) => f());
      void unlistenClosed.then((f) => f());
      void unlistenError.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    setError(null);

    void (async () => {
      try {
        const partitions = partitionFilter === ALL_PARTITIONS ? [] : [Number(partitionFilter)];
        const id = await invoke<number>("kafka_start_consume_stream", { brokers, topic: topic.name, partitions });
        if (cancelled) {
          void invoke("kafka_stop_consume_stream", { streamId: id });
          return;
        }
        streamIdRef.current = id;
      } catch (e) {
        setError(String(e));
        setLive(false);
      }
    })();

    return () => {
      cancelled = true;
      if (streamIdRef.current !== null) {
        void invoke("kafka_stop_consume_stream", { streamId: streamIdRef.current });
        streamIdRef.current = null;
      }
    };
  }, [live, brokers, topic.name, partitionFilter]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Stream error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Select value={partitionFilter} onValueChange={setPartitionFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Partition" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PARTITIONS}>All partitions</SelectItem>
              {topic.partitions.map((p) => (
                <SelectItem key={p} value={String(p)}>
                  Partition {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`size-1.5 rounded-full bg-emerald-500 ${live ? "animate-pulse" : "invisible"}`} />
            Live
            <Switch checked={live} onCheckedChange={setLive} size="sm" />
          </label>
          <Button variant="outline" size="sm" onClick={() => setMessages([])} disabled={messages.length === 0}>
            <Trash2 />
            Clear
          </Button>
        </div>
        <SearchToolbar
          query={search.query}
          onQueryChange={search.setQuery}
          matchCount={search.matchCount}
          currentMatch={search.currentMatch}
          onStep={search.stepMatch}
        />
      </div>
      <JsonDetailPane
        content={messagesText === "[]" ? "" : messagesText}
        segments={search.segments}
        currentMatch={search.currentMatch}
        emptyLabel="No messages tailed yet. Toggle Live to start."
      />
    </div>
  );
}
