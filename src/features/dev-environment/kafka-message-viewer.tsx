import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ArrowDown, Search, Trash2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { JsonDetailPane, useContentSearch } from "@/features/dev-environment/json-detail-pane";
import { filterMessages, type KafkaMessageRow, type KafkaTopicSummary } from "@/features/dev-environment/kafka-manager-logic";

const ALL_PARTITIONS = "__all__";
const MAX_MESSAGES = 500;

interface KafkaMessagePayload {
  streamId: number;
  topic: string;
  message: KafkaMessageRow;
}

function MessageDetailSheet({ message, onClose }: { message: KafkaMessageRow | null; onClose: () => void }) {
  const text = useMemo(() => (message ? JSON.stringify(message, null, 2) : ""), [message]);
  const search = useContentSearch("json", text);

  return (
    <Sheet open={message !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex flex-col gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {message && `Partition ${message.partition} · Offset ${message.offset}`}
          </SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 px-4 pb-4">
          <JsonDetailPane content={text} segments={search.segments} currentMatch={search.currentMatch} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MessageRow({ message, onClick }: { message: KafkaMessageRow; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs hover:bg-muted/50"
    >
      <span className="w-20 shrink-0 text-muted-foreground tabular-nums">
        {new Date(message.timestamp_ms).toLocaleTimeString()}
      </span>
      <Badge variant="outline" className="shrink-0">
        p{message.partition}
      </Badge>
      <Badge variant="outline" className="shrink-0 tabular-nums">
        {message.offset}
      </Badge>
      {message.key && <span className="shrink-0 max-w-32 truncate font-mono text-muted-foreground">{message.key}</span>}
      <span className="min-w-0 flex-1 truncate font-mono">{message.value ?? <span className="text-muted-foreground">{"<null>"}</span>}</span>
      {message.headers.length > 0 && (
        <Badge variant="outline" className="shrink-0">
          {message.headers.length} hdr
        </Badge>
      )}
    </button>
  );
}

export function KafkaMessageViewer({ brokers, topic }: { brokers: string; topic: KafkaTopicSummary }) {
  const [partitionFilter, setPartitionFilter] = useState(ALL_PARTITIONS);
  const [live, setLive] = useState(false);
  const [messages, setMessages] = useState<KafkaMessageRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<KafkaMessageRow | null>(null);
  const streamIdRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [autoFollow, setAutoFollow] = useState(true);

  const filtered = useMemo(() => filterMessages(messages, query), [messages, query]);

  useEffect(() => {
    setMessages([]);
    setPartitionFilter(ALL_PARTITIONS);
    setLive(false);
    setAutoFollow(true);
  }, [topic.name]);

  useEffect(() => {
    if (!autoFollow) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [filtered, autoFollow]);

  const handleListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAutoFollow(distanceFromBottom < 24);
  };

  const jumpToLatest = () => {
    setAutoFollow(true);
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

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
        <div className="relative">
          <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter messages..."
            className="h-7 w-48 pl-7 text-xs"
          />
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={handleListScroll}
          className="flex h-full flex-col gap-1 overflow-y-auto rounded-lg border p-1.5"
        >
          {filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
              {messages.length === 0 ? "No messages tailed yet. Toggle Live to start." : "No messages match your filter."}
            </div>
          ) : (
            filtered.map((message, i) => (
              <MessageRow key={`${message.partition}-${message.offset}-${i}`} message={message} onClick={() => setSelected(message)} />
            ))
          )}
        </div>
        {!autoFollow && filtered.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={jumpToLatest}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 shadow-md"
          >
            <ArrowDown />
            Jump to latest
          </Button>
        )}
      </div>
      <MessageDetailSheet message={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
