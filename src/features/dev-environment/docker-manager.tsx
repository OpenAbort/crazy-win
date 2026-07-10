import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Container,
  LoaderCircle,
  PlugZap,
  RefreshCw,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDeleteDialog } from "@/features/dev-environment/confirm-delete-dialog";
import {
  filterContainers,
  parseContainerList,
  parseInspect,
  type DockerContainerSummary,
} from "@/features/dev-environment/docker-manager-logic";
import {
  getDockerHost,
  getDockerMode,
  setDockerHost,
  setDockerMode,
  type ConnectionMode,
} from "@/features/dev-environment/dev-environment-store";
import { JsonDetailPane, SearchToolbar, useContentSearch } from "@/features/dev-environment/json-detail-pane";

export function DockerManager() {
  const [host, setHost] = useState("");
  const [mode, setMode] = useState<ConnectionMode>("cli");
  const [containers, setContainers] = useState<DockerContainerSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspectText, setInspectText] = useState("");
  const [logsText, setLogsText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DockerContainerSummary | null>(null);

  const [activeDetailTab, setActiveDetailTab] = useState("inspect");
  const [live, setLive] = useState(false);
  const streamIdRef = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const detailSearch = useContentSearch(
    activeDetailTab === "logs" ? "text" : "json",
    activeDetailTab === "logs" ? logsText : inspectText,
  );

  const filtered = useMemo(() => filterContainers(containers, query), [containers, query]);
  const selected = useMemo(
    () => containers.find((c) => c.ID === selectedId) ?? null,
    [containers, selectedId],
  );

  useEffect(() => {
    void (async () => {
      try {
        const savedHost = await getDockerHost();
        const savedMode = await getDockerMode();
        setHost(savedHost);
        setMode(savedMode === "api" && !savedHost.trim() ? "cli" : savedMode);
        await refresh(savedHost, savedMode);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  useEffect(() => {
    if (!selected) {
      setInspectText("");
      setLogsText("");
      return;
    }
    void loadInspect(selected.ID);
    void loadLogs(selected.ID);
  }, [selected?.ID]);

  async function refresh(hostOverride?: string, modeOverride?: ConnectionMode) {
    setLoading(true);
    setError(null);
    try {
      const raw = await invoke<string>("docker_list_containers", {
        host: hostOverride ?? host,
        mode: modeOverride ?? mode,
      });
      setContainers(parseContainerList(raw));
    } catch (e) {
      setError(String(e));
      setContainers([]);
    } finally {
      setLoading(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setError(null);
    setStatus(null);
    try {
      await invoke<string>("docker_info", { host, mode });
      setStatus("Connected");
    } catch (e) {
      setError(String(e));
    } finally {
      setTesting(false);
    }
  }

  async function loadInspect(id: string) {
    try {
      const raw = await invoke<string>("docker_inspect_container", { host, id, mode });
      setInspectText(JSON.stringify(parseInspect(raw), null, 2));
    } catch (e) {
      setInspectText(`Failed to inspect: ${String(e)}`);
    }
  }

  async function loadLogs(id: string) {
    try {
      setLogsText(await invoke<string>("docker_container_logs", { host, id, tail: 300, mode }));
    } catch (e) {
      setLogsText(`Failed to load logs: ${String(e)}`);
    }
  }

  // Listen once for streamed log lines (CLI mode) and only apply the ones that
  // belong to the currently-active stream, since switching containers/toggling
  // Live off can leave a stop request in flight.
  useEffect(() => {
    const unlistenLine = listen<{ streamId: number; line: string }>("docker-log-line", (event) => {
      const { streamId, line } = event.payload;
      if (streamId === streamIdRef.current) {
        setLogsText((t) => (t ? `${t}\n${line}` : line));
      }
    });
    const unlistenClosed = listen<number>("docker-log-closed", (event) => {
      if (event.payload === streamIdRef.current) {
        streamIdRef.current = null;
        setLive(false);
      }
    });
    return () => {
      void unlistenLine.then((f) => f());
      void unlistenClosed.then((f) => f());
    };
  }, []);

  // Starts/stops the live tail whenever `live` is toggled or the selected
  // container changes while it's on; CLI mode streams via Tauri events, API
  // mode polls the existing one-shot logs command instead (see plan).
  useEffect(() => {
    if (!live || !selected) return;
    const containerId = selected.ID;
    let cancelled = false;

    if (mode === "cli") {
      void (async () => {
        try {
          const id = await invoke<number>("docker_start_log_stream", { host, id: containerId, tail: 300, mode });
          if (cancelled) {
            void invoke("docker_stop_log_stream", { streamId: id });
            return;
          }
          streamIdRef.current = id;
        } catch (e) {
          setLogsText((t) => `${t ? `${t}\n` : ""}Failed to start live tail: ${String(e)}`);
          setLive(false);
        }
      })();
    } else {
      pollRef.current = setInterval(() => void loadLogs(containerId), 2000);
    }

    return () => {
      cancelled = true;
      if (streamIdRef.current !== null) {
        void invoke("docker_stop_log_stream", { streamId: streamIdRef.current });
        streamIdRef.current = null;
      }
      if (pollRef.current !== null) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [live, selected?.ID, mode, host]);

  async function handleRemove(force: boolean) {
    if (!deleteTarget) return;
    await invoke("docker_remove_container", { host, id: deleteTarget.ID, force, mode });
    if (selectedId === deleteTarget.ID) setSelectedId(null);
    await refresh();
  }

  function handleModeChange(next: ConnectionMode) {
    setMode(next);
    void setDockerMode(next);
  }

  function isRunning(c: DockerContainerSummary) {
    return c.State === "running";
  }

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background px-6 py-4">
        <div>
          <h1 className="font-heading text-lg font-medium">Docker Manager</h1>
          <p className="text-sm text-muted-foreground">
            Browse, inspect, and remove Docker containers
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        {error && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-2">
          <Input
            value={host}
            onChange={(e) => {
              setHost(e.target.value);
              void setDockerHost(e.target.value);
              if (!e.target.value.trim() && mode === "api") handleModeChange("cli");
            }}
            placeholder="tcp://host:2375 (leave empty for local socket)"
            className="max-w-sm font-mono text-sm"
          />
          <Tabs value={mode} onValueChange={(v) => handleModeChange(v as ConnectionMode)}>
            <TabsList>
              <TabsTrigger value="cli">CLI</TabsTrigger>
              <TabsTrigger value="api" disabled={!host.trim()}>
                Direct API
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" onClick={() => void testConnection()} disabled={testing}>
            {testing ? <LoaderCircle className="animate-spin" /> : <PlugZap />}
            Test connection
          </Button>
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
          {status && <span className="text-sm text-emerald-500">{status}</span>}
        </div>
        {mode === "cli" ? (
          <p className="-mt-2 text-xs text-muted-foreground">
            CLI mode shells out to <code>docker.exe</code> on PATH.
          </p>
        ) : (
          <p className="-mt-2 text-xs text-muted-foreground">
            Direct API mode talks to the Docker Engine API over HTTP — no <code>docker.exe</code> needed, but only works with a TCP host (no TLS client-cert support yet).
          </p>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-1.5">
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by name, image, or id..."
                className="pl-8"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
              <div className="divide-y">
                {filtered.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground">
                    <Container className="size-6" />
                    No containers found.
                  </div>
                )}
                {filtered.map((c) => (
                  <button
                    key={c.ID}
                    onClick={() => setSelectedId(c.ID)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 ${
                      selectedId === c.ID ? "bg-muted" : ""
                    }`}
                  >
                    <Badge variant={isRunning(c) ? "default" : "outline"}>{c.State}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-sm">{c.Names}</div>
                      <div className="truncate text-xs text-muted-foreground">{c.Image}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(c);
                      }}
                      aria-label="Remove container"
                    >
                      <Trash2 />
                    </Button>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-1.5">
            {selected ? (
              <Tabs
                value={activeDetailTab}
                onValueChange={setActiveDetailTab}
                className="flex min-h-0 flex-1 flex-col gap-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <TabsList>
                    <TabsTrigger value="inspect">Inspect</TabsTrigger>
                    <TabsTrigger value="logs">Logs</TabsTrigger>
                  </TabsList>
                  <div className="flex items-center gap-2">
                    {activeDetailTab === "logs" && (
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className={`size-1.5 rounded-full bg-emerald-500 ${live ? "animate-pulse" : "invisible"}`} />
                        Live
                        <Switch
                          checked={live}
                          onCheckedChange={setLive}
                          size="sm"
                          disabled={!selected}
                        />
                      </label>
                    )}
                    <SearchToolbar
                      query={detailSearch.query}
                      onQueryChange={detailSearch.setQuery}
                      matchCount={detailSearch.matchCount}
                      currentMatch={detailSearch.currentMatch}
                      onStep={detailSearch.stepMatch}
                    />
                  </div>
                </div>
                <TabsContent value="inspect" className="min-h-0 flex-1">
                  <JsonDetailPane
                    content={inspectText}
                    segments={detailSearch.segments}
                    currentMatch={detailSearch.currentMatch}
                  />
                </TabsContent>
                <TabsContent value="logs" className="min-h-0 flex-1">
                  <JsonDetailPane
                    content={logsText}
                    segments={detailSearch.segments}
                    currentMatch={detailSearch.currentMatch}
                    emptyLabel="No logs"
                  />
                </TabsContent>
              </Tabs>
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border text-center text-sm text-muted-foreground">
                Select a container to view details
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        resourceLabel={deleteTarget?.Names ?? ""}
        actionLabel="Remove"
        showForce={!!deleteTarget && isRunning(deleteTarget)}
        onConfirm={handleRemove}
      />
    </div>
  );
}
