import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Anchor, RefreshCw, Trash2, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDeleteDialog } from "@/features/dev-environment/confirm-delete-dialog";
import {
  getKubeConnectionSource,
  getKubeContext,
  getKubeManualConnection,
  getKubeNamespace,
  setKubeConnectionSource,
  setKubeContext,
  setKubeManualConnection,
  setKubeNamespace,
  type KubeConnectionSource,
  type KubeManualConnection,
} from "@/features/dev-environment/dev-environment-store";
import { parseReleaseList, type HelmReleaseSummary } from "@/features/dev-environment/helm-releases-logic";
import { parseContextNames, parseNamespaceList } from "@/features/dev-environment/kubernetes-manager-logic";
import { JsonDetailPane, SearchToolbar, useContentSearch } from "@/features/dev-environment/json-detail-pane";

const ALL_NAMESPACES = "__all__";
const DEFAULT_MANUAL_CONNECTION: KubeManualConnection = { server: "", token: "", insecure: false };

export function HelmReleases() {
  const [connectionSource, setConnectionSource] = useState<KubeConnectionSource>("context");
  const [manualConnection, setManualConnection] = useState<KubeManualConnection>(DEFAULT_MANUAL_CONNECTION);
  const [contexts, setContexts] = useState<string[]>([]);
  const [context, setContext] = useState("");
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [namespace, setNamespace] = useState(ALL_NAMESPACES);

  const [releases, setReleases] = useState<HelmReleaseSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [valuesText, setValuesText] = useState("");
  const [statusText, setStatusText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<HelmReleaseSummary | null>(null);

  const selected = useMemo(
    () => releases.find((r) => r.name === selectedName) ?? null,
    [releases, selectedName],
  );

  const valuesSearch = useContentSearch("yaml", valuesText);
  const statusSearch = useContentSearch("json", statusText);

  const manualParam = connectionSource === "manual" ? manualConnection : undefined;
  const ready = connectionSource === "manual" ? !!manualConnection.server.trim() : !!context;

  useEffect(() => {
    void (async () => {
      setError(null);
      try {
        const savedSource = await getKubeConnectionSource();
        setConnectionSource(savedSource);
        setManualConnection(await getKubeManualConnection());

        if (savedSource === "manual") return;

        const rawContexts = await invoke<string>("kube_list_contexts", { mode: "cli" });
        const names = parseContextNames(rawContexts);
        setContexts(names);

        const saved = await getKubeContext();
        const initial =
          saved && names.includes(saved)
            ? saved
            : await invoke<string>("kube_current_context", { mode: "cli" }).catch(() => names[0] ?? "");
        setContext(initial.trim());

        const savedNs = await getKubeNamespace();
        setNamespace(savedNs ?? ALL_NAMESPACES);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    void loadNamespaces(context);
  }, [context, connectionSource, manualConnection.server, manualConnection.token, manualConnection.insecure]);

  useEffect(() => {
    if (!ready) return;
    setSelectedName(null);
    void refresh();
  }, [context, namespace, connectionSource, manualConnection.server, manualConnection.token, manualConnection.insecure]);

  useEffect(() => {
    if (!selected || !ready) {
      setValuesText("");
      setStatusText("");
      return;
    }
    void loadValues(selected);
    void loadStatus(selected);
  }, [selected?.name]);

  function handleConnectionSourceChange(next: KubeConnectionSource) {
    setConnectionSource(next);
    void setKubeConnectionSource(next);
  }

  function updateManualField<K extends keyof KubeManualConnection>(field: K, value: KubeManualConnection[K]) {
    const next = { ...manualConnection, [field]: value };
    setManualConnection(next);
    void setKubeManualConnection(next);
  }

  async function loadNamespaces(ctx: string) {
    try {
      const raw = await invoke<string>("kube_list_namespaces", { context: ctx, mode: "cli", manual: manualParam });
      setNamespaces(parseNamespaceList(raw));
    } catch (e) {
      setError(String(e));
    }
  }

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const ns = namespace === ALL_NAMESPACES ? null : namespace;
      const raw = await invoke<string>("helm_list_releases", { context, namespace: ns, manual: manualParam });
      setReleases(parseReleaseList(raw));
    } catch (e) {
      setError(String(e));
      setReleases([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadValues(release: HelmReleaseSummary) {
    try {
      setValuesText(
        await invoke<string>("helm_get_values", {
          context,
          namespace: release.namespace,
          release: release.name,
          manual: manualParam,
        }),
      );
    } catch (e) {
      setValuesText(`Failed to load values: ${String(e)}`);
    }
  }

  async function loadStatus(release: HelmReleaseSummary) {
    try {
      const raw = await invoke<string>("helm_status", {
        context,
        namespace: release.namespace,
        release: release.name,
        manual: manualParam,
      });
      setStatusText(JSON.stringify(JSON.parse(raw), null, 2));
    } catch (e) {
      setStatusText(`Failed to load status: ${String(e)}`);
    }
  }

  async function handleUninstall() {
    if (!deleteTarget) return;
    await invoke("helm_uninstall", {
      context,
      namespace: deleteTarget.namespace,
      release: deleteTarget.name,
      manual: manualParam,
    });
    if (selectedName === deleteTarget.name) setSelectedName(null);
    await refresh();
  }

  function handleContextChange(next: string) {
    setContext(next);
    void setKubeContext(next);
    setNamespace(ALL_NAMESPACES);
  }

  function handleNamespaceChange(next: string) {
    setNamespace(next);
    void setKubeNamespace(next === ALL_NAMESPACES ? null : next);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background px-6 py-4">
        <div>
          <h1 className="font-heading text-lg font-medium">Helm Releases</h1>
          <p className="text-sm text-muted-foreground">
            View and manage installed Helm releases
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

        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={connectionSource} onValueChange={(v) => handleConnectionSourceChange(v as KubeConnectionSource)}>
            <TabsList>
              <TabsTrigger value="context">Kubeconfig</TabsTrigger>
              <TabsTrigger value="manual">Manual</TabsTrigger>
            </TabsList>
          </Tabs>

          {connectionSource === "context" && (
            <Select value={context} onValueChange={handleContextChange}>
              <SelectTrigger>
                <SelectValue placeholder="Context" />
              </SelectTrigger>
              <SelectContent>
                {contexts.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={namespace} onValueChange={handleNamespaceChange}>
            <SelectTrigger>
              <SelectValue placeholder="Namespace" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_NAMESPACES}>All namespaces</SelectItem>
              {namespaces.map((ns) => (
                <SelectItem key={ns} value={ns}>
                  {ns}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
        {connectionSource === "manual" && (
          <div className="-mt-2 flex flex-wrap items-center gap-2">
            <Input
              value={manualConnection.server}
              onChange={(e) => updateManualField("server", e.target.value)}
              placeholder="https://api-server:6443"
              className="w-64"
            />
            <Input
              value={manualConnection.token}
              onChange={(e) => updateManualField("token", e.target.value)}
              placeholder="Bearer token (optional)"
              type="password"
              className="w-56"
            />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Skip TLS verify
              <Switch
                checked={manualConnection.insecure}
                onCheckedChange={(v) => updateManualField("insecure", v)}
                size="sm"
              />
            </label>
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
            <div className="divide-y">
              {releases.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground">
                  <Anchor className="size-6" />
                  No releases found.
                </div>
              )}
              {releases.map((r) => (
                <button
                  key={`${r.namespace}/${r.name}`}
                  onClick={() => setSelectedName(r.name)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 ${
                    selectedName === r.name ? "bg-muted" : ""
                  }`}
                >
                  <Badge variant="outline">{r.status}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-sm">{r.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {r.chart} · {r.namespace}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(r);
                    }}
                    aria-label="Uninstall release"
                  >
                    <Trash2 />
                  </Button>
                </button>
              ))}
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-1.5">
            {selected ? (
              <Tabs defaultValue="values" className="flex min-h-0 flex-1 flex-col gap-1.5">
                <TabsList>
                  <TabsTrigger value="values">Values</TabsTrigger>
                  <TabsTrigger value="status">Status</TabsTrigger>
                </TabsList>
                <TabsContent value="values" className="flex min-h-0 flex-1 flex-col gap-1.5">
                  <SearchToolbar
                    query={valuesSearch.query}
                    onQueryChange={valuesSearch.setQuery}
                    matchCount={valuesSearch.matchCount}
                    currentMatch={valuesSearch.currentMatch}
                    onStep={valuesSearch.stepMatch}
                  />
                  <JsonDetailPane
                    content={valuesText}
                    segments={valuesSearch.segments}
                    currentMatch={valuesSearch.currentMatch}
                    scrollTick={valuesSearch.scrollTick}
                  />
                </TabsContent>
                <TabsContent value="status" className="flex min-h-0 flex-1 flex-col gap-1.5">
                  <SearchToolbar
                    query={statusSearch.query}
                    onQueryChange={statusSearch.setQuery}
                    matchCount={statusSearch.matchCount}
                    currentMatch={statusSearch.currentMatch}
                    onStep={statusSearch.stepMatch}
                  />
                  <JsonDetailPane
                    content={statusText}
                    segments={statusSearch.segments}
                    currentMatch={statusSearch.currentMatch}
                    scrollTick={statusSearch.scrollTick}
                  />
                </TabsContent>
              </Tabs>
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border text-center text-sm text-muted-foreground">
                Select a release to view details
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        resourceLabel={deleteTarget?.name ?? ""}
        actionLabel="Uninstall"
        onConfirm={handleUninstall}
      />
    </div>
  );
}
