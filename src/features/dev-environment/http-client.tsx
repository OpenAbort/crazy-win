import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Search, Send, Trash2, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  addHttpHistoryEntry,
  getHttpHistory,
  removeHttpHistoryEntry,
  type HttpHistoryEntry,
} from "@/features/dev-environment/http-client-store";
import { JsonDetailPane, SearchToolbar, useContentSearch } from "@/features/dev-environment/json-detail-pane";

interface HttpResponseData {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
  durationMs: number;
}

interface HeaderRow {
  id: string;
  key: string;
  value: string;
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function statusColorClass(status: number): string {
  if (status >= 200 && status < 300) return "text-emerald-600 dark:text-emerald-400";
  if (status >= 300 && status < 400) return "text-blue-600 dark:text-blue-400";
  return "text-red-600 dark:text-red-400";
}

export function HttpClientTool() {
  const [history, setHistory] = useState<HttpHistoryEntry[]>([]);
  const [query, setQuery] = useState("");

  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("");
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>([{ id: crypto.randomUUID(), key: "", value: "" }]);
  const [body, setBody] = useState("");
  const [insecure, setInsecure] = useState(false);
  const [reqTab, setReqTab] = useState("headers");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<HttpResponseData | null>(null);
  const [respTab, setRespTab] = useState("body");

  useEffect(() => {
    void getHttpHistory().then(setHistory);
  }, []);

  const filtered = useMemo(
    () => history.filter((h) => h.url.toLowerCase().includes(query.toLowerCase())),
    [history, query],
  );

  const bodyLanguage = useMemo(() => {
    const contentType = response?.headers.find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "";
    return contentType.includes("json") ? "json" : "text";
  }, [response]) as "json" | "text";
  const responseSearch = useContentSearch(bodyLanguage, response?.body ?? "");

  async function handleSend() {
    if (!url.trim()) return;
    setSending(true);
    setError(null);
    try {
      const headers: [string, string][] = headerRows
        .filter((r) => r.key.trim())
        .map((r) => [r.key, r.value]);
      const resp = await invoke<HttpResponseData>("http_send_request", {
        method,
        url,
        headers,
        body: body || undefined,
        insecure,
      });
      setResponse(resp);
      setHistory(await addHttpHistoryEntry({ method, url, headers, body }));
    } catch (e) {
      setError(String(e));
      setResponse(null);
    } finally {
      setSending(false);
    }
  }

  function loadEntry(entry: HttpHistoryEntry) {
    setMethod(entry.method);
    setUrl(entry.url);
    setHeaderRows(
      entry.headers.length > 0
        ? entry.headers.map(([key, value]) => ({ id: crypto.randomUUID(), key, value }))
        : [{ id: crypto.randomUUID(), key: "", value: "" }],
    );
    setBody(entry.body);
    setResponse(null);
    setError(null);
  }

  async function handleRemoveEntry(id: string) {
    setHistory(await removeHttpHistoryEntry(id));
  }

  function addHeaderRow() {
    setHeaderRows((prev) => [...prev, { id: crypto.randomUUID(), key: "", value: "" }]);
  }
  function removeHeaderRow(id: string) {
    setHeaderRows((prev) => prev.filter((r) => r.id !== id));
  }
  function updateHeaderRow(id: string, field: "key" | "value", value: string) {
    setHeaderRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background px-6 py-4">
        <div>
          <h1 className="font-heading text-lg font-medium">HTTP Client</h1>
          <p className="text-sm text-muted-foreground">Build and send arbitrary HTTP requests</p>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-6 lg:grid-cols-[280px_1fr]">
        <div className="flex min-h-0 flex-col gap-1.5">
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter history by URL..."
              className="pl-8"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
            <div className="divide-y">
              {filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground">
                  No requests yet.
                </div>
              )}
              {filtered.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => loadEntry(entry)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
                >
                  <Badge variant="outline" className="shrink-0 text-xs">
                    {entry.method}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{entry.url}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleRemoveEntry(entry.id);
                    }}
                    aria-label="Remove from history"
                  >
                    <Trash2 />
                  </Button>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>Request failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex shrink-0 items-center gap-2">
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleSend()}
              placeholder="https://api.example.com/resource"
              className="flex-1 font-mono text-sm"
            />
            <Button onClick={() => void handleSend()} disabled={sending || !url.trim()}>
              <Send />
              {sending ? "Sending..." : "Send"}
            </Button>
          </div>

          <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={insecure} onCheckedChange={setInsecure} size="sm" />
            Skip TLS verification
          </label>

          <Tabs value={reqTab} onValueChange={setReqTab} className="shrink-0 gap-1.5">
            <TabsList>
              <TabsTrigger value="headers">Headers</TabsTrigger>
              <TabsTrigger value="body">Body</TabsTrigger>
            </TabsList>
            <TabsContent value="headers" className="flex flex-col gap-1.5">
              {headerRows.map((row) => (
                <div key={row.id} className="flex items-center gap-1.5">
                  <Input
                    value={row.key}
                    onChange={(e) => updateHeaderRow(row.id, "key", e.target.value)}
                    placeholder="Header name"
                    className="flex-1 font-mono text-xs"
                  />
                  <Input
                    value={row.value}
                    onChange={(e) => updateHeaderRow(row.id, "value", e.target.value)}
                    placeholder="Value"
                    className="flex-1 font-mono text-xs"
                  />
                  <Button variant="ghost" size="icon-sm" onClick={() => removeHeaderRow(row.id)} aria-label="Remove header">
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addHeaderRow} className="w-fit">
                <Plus />
                Add header
              </Button>
            </TabsContent>
            <TabsContent value="body">
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                spellCheck={false}
                placeholder="Raw request body..."
                className="h-32 resize-none font-mono text-xs"
              />
            </TabsContent>
          </Tabs>

          <div className="flex min-h-0 flex-1 flex-col gap-1.5">
            {response ? (
              <Tabs value={respTab} onValueChange={setRespTab} className="flex min-h-0 flex-1 flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={statusColorClass(response.status)}>
                      {response.status} {response.statusText}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{response.durationMs}ms</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TabsList>
                      <TabsTrigger value="body">Body</TabsTrigger>
                      <TabsTrigger value="headers">Headers</TabsTrigger>
                    </TabsList>
                    {respTab === "body" && (
                      <SearchToolbar
                        query={responseSearch.query}
                        onQueryChange={responseSearch.setQuery}
                        matchCount={responseSearch.matchCount}
                        currentMatch={responseSearch.currentMatch}
                        onStep={responseSearch.stepMatch}
                      />
                    )}
                  </div>
                </div>
                <TabsContent value="body" className="min-h-0 flex-1">
                  <JsonDetailPane
                    content={response.body}
                    segments={responseSearch.segments}
                    currentMatch={responseSearch.currentMatch}
                    scrollTick={responseSearch.scrollTick}
                    emptyLabel="Empty response body"
                  />
                </TabsContent>
                <TabsContent value="headers" className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
                  <div className="divide-y">
                    {response.headers.map(([k, v], i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                        <span className="w-40 shrink-0 truncate font-mono font-medium">{k}</span>
                        <span className="min-w-0 flex-1 truncate font-mono">{v}</span>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border text-center text-sm text-muted-foreground">
                Send a request to see the response
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
