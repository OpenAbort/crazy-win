import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Boxes, RefreshCw, Search, SquareTerminal, Trash2, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteDialog } from "@/features/dev-environment/confirm-delete-dialog";
import {
  getKubeConnectionSource,
  getKubeContext,
  getKubeManualConnection,
  getKubeMode,
  getKubeNamespace,
  setKubeConnectionSource,
  setKubeContext,
  setKubeManualConnection,
  setKubeMode,
  setKubeNamespace,
  type ConnectionMode,
  type KubeConnectionSource,
  type KubeManualConnection,
} from "@/features/dev-environment/dev-environment-store";
import {
  filterResources,
  parseContextNames,
  parseNamespaceList,
  parseResourceList,
  statusColorClass,
  type K8sKind,
  type K8sResourceSummary,
} from "@/features/dev-environment/kubernetes-manager-logic";
import { TOKEN_CLASSES } from "@/features/dev-environment/json-detail-pane";
import { ensureTerminalOutputRouter } from "@/features/dev-environment/terminal-logic";
import { TerminalPane } from "@/features/dev-environment/terminal-pane";
import { applySearch, tokenize } from "@/features/dev-tools/formatter-highlight";

const ALL_NAMESPACES = "__all__";
const KINDS: K8sKind[] = ["pods", "deployments", "services"];

const DEFAULT_MANUAL_CONNECTION: KubeManualConnection = { server: "", token: "", insecure: false };

const SECTION_ACCENT: Record<string, string> = {
  metadata: "border-l-blue-500",
  spec: "border-l-violet-500",
  status: "border-l-emerald-500",
};
function sectionAccent(key: string): string {
  return SECTION_ACCENT[key] ?? "border-l-slate-400";
}

export function KubernetesManager() {
  const [mode, setMode] = useState<ConnectionMode>("cli");
  const [connectionSource, setConnectionSource] = useState<KubeConnectionSource>("context");
  const [manualConnection, setManualConnection] = useState<KubeManualConnection>(DEFAULT_MANUAL_CONNECTION);
  const [contexts, setContexts] = useState<string[]>([]);
  const [context, setContext] = useState<string>("");
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [namespace, setNamespace] = useState<string>(ALL_NAMESPACES);
  const [kind, setKind] = useState<K8sKind>("pods");

  const [resources, setResources] = useState<K8sResourceSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [describeText, setDescribeText] = useState("");
  const [editText, setEditText] = useState("");
  const [manifestQuery, setManifestQuery] = useState("");
  const [detailTab, setDetailTab] = useState("describe");
  const [scaleValue, setScaleValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<K8sResourceSummary | null>(null);

  const [execTarget, setExecTarget] = useState<K8sResourceSummary | null>(null);
  const [execContainer, setExecContainer] = useState("");
  const [execShell, setExecShell] = useState("/bin/sh");
  const [execSessionId, setExecSessionId] = useState<number | null>(null);
  const [execError, setExecError] = useState<string | null>(null);

  const selected = useMemo(
    () => resources.find((r) => r.name === selectedName) ?? null,
    [resources, selectedName],
  );

  const filtered = useMemo(() => filterResources(resources, query), [resources, query]);

  // One top-level key per section (metadata/spec/status/etc.), each pre-tokenized
  // and searched — computed as a single hook call over the whole list rather than
  // one useContentSearch() per section, since the section count varies by
  // resource/kind and hooks can't be called a variable number of times.
  const sections = useMemo(() => {
    if (!selected) return [];
    const raw = selected.raw as Record<string, unknown>;
    return Object.entries(raw).map(([key, value]) => ({ key, text: JSON.stringify(value, null, 2) }));
  }, [selected?.name]);

  const sectionResults = useMemo(
    () =>
      sections.map((s) => ({
        key: s.key,
        ...applySearch(tokenize("json", s.text), manifestQuery),
      })),
    [sections, manifestQuery],
  );

  const manualParam = connectionSource === "manual" ? manualConnection : undefined;
  const ready = connectionSource === "manual" ? !!manualConnection.server.trim() : !!context;

  useEffect(() => {
    if (ready) return;
    setResources([]);
    setNamespaces([]);
    setSelectedName(null);
  }, [ready]);

  useEffect(() => {
    // Attach the shared PTY output router so pod-exec sessions work even if
    // the user never visits the Terminal tool (idempotent — safe to call
    // from multiple places).
    ensureTerminalOutputRouter();
  }, []);

  // Closing the exec sheet (its own button) already tells the backend to
  // close the session; this covers the other path — the whole tool
  // unmounting because the user switched to a different DevBox tool, which
  // would otherwise leak the `kubectl exec` child process, since (unlike the
  // Terminal tool) this tool isn't in App.tsx's keep-alive list.
  useEffect(() => {
    return () => {
      if (execSessionId !== null) void invoke("terminal_close_session", { sessionId: execSessionId });
    };
  }, [execSessionId]);

  useEffect(() => {
    void (async () => {
      setError(null);
      try {
        const savedMode = await getKubeMode();
        setMode(savedMode);

        const savedSource = await getKubeConnectionSource();
        setConnectionSource(savedSource);
        setManualConnection(await getKubeManualConnection());

        if (savedSource === "manual") return;

        const rawContexts = await invoke<string>("kube_list_contexts", { mode: savedMode });
        const names = parseContextNames(rawContexts);
        setContexts(names);

        const saved = await getKubeContext();
        const initial =
          saved && names.includes(saved)
            ? saved
            : await invoke<string>("kube_current_context", { mode: savedMode }).catch(() => names[0] ?? "");
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
  }, [context, mode, connectionSource, manualConnection.server, manualConnection.token, manualConnection.insecure]);

  useEffect(() => {
    if (!ready) return;
    setSelectedName(null);
    void refresh();
  }, [context, namespace, kind, mode, connectionSource, manualConnection.server, manualConnection.token, manualConnection.insecure]);

  useEffect(() => {
    if (!selected || !ready) {
      setDescribeText("");
      setEditText("");
      setManifestQuery("");
      return;
    }
    setScaleValue("");
    setEditText(JSON.stringify(selected.raw, null, 2));
    setManifestQuery("");
    void loadDescribe(selected);
  }, [selected?.name]);

  function handleConnectionSourceChange(next: KubeConnectionSource) {
    setConnectionSource(next);
    void setKubeConnectionSource(next);
  }

  function handleManualConnectionChange(next: KubeManualConnection) {
    setManualConnection(next);
    void setKubeManualConnection(next);
  }

  async function loadNamespaces(ctx: string) {
    try {
      const raw = await invoke<string>("kube_list_namespaces", { context: ctx, mode, manual: manualParam });
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
      const raw = await invoke<string>("kube_list_resources", { context, namespace: ns, kind, mode, manual: manualParam });
      setResources(parseResourceList(raw, kind));
    } catch (e) {
      setError(String(e));
      setResources([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadDescribe(resource: K8sResourceSummary) {
    try {
      const text = await invoke<string>("kube_describe_resource", {
        context,
        namespace: resource.namespace,
        kind,
        name: resource.name,
        mode,
        manual: manualParam,
      });
      setDescribeText(text);
    } catch (e) {
      setDescribeText(`Failed to describe: ${String(e)}`);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await invoke("kube_delete_resource", {
      context,
      namespace: deleteTarget.namespace,
      kind,
      name: deleteTarget.name,
      mode,
      manual: manualParam,
    });
    if (selectedName === deleteTarget.name) setSelectedName(null);
    await refresh();
  }

  async function handleScale() {
    if (!selected) return;
    const replicas = Number(scaleValue);
    if (!Number.isFinite(replicas) || replicas < 0) return;
    setError(null);
    try {
      await invoke("kube_scale_deployment", {
        context,
        namespace: selected.namespace,
        name: selected.name,
        replicas,
        mode,
        manual: manualParam,
      });
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSaveManifest() {
    if (!selected) return;
    setError(null);
    try {
      await invoke("kube_apply_manifest", {
        context,
        namespace: selected.namespace,
        kind,
        name: selected.name,
        mode,
        manual: manualParam,
        content: editText,
      });
      await refresh();
      await loadDescribe(selected);
    } catch (e) {
      setError(String(e));
    }
  }

  function openExec(resource: K8sResourceSummary) {
    setExecTarget(resource);
    setExecContainer("");
    setExecShell("/bin/sh");
    setExecSessionId(null);
    setExecError(null);
  }

  async function handleStartExec() {
    if (!execTarget) return;
    setExecError(null);
    try {
      const sessionId = await invoke<number>("kube_exec_start", {
        context,
        namespace: execTarget.namespace,
        pod: execTarget.name,
        container: execContainer.trim() || undefined,
        shell: execShell.trim() || "/bin/sh",
        manual: manualParam,
      });
      setExecSessionId(sessionId);
    } catch (e) {
      setExecError(String(e));
    }
  }

  function closeExec() {
    if (execSessionId !== null) void invoke("terminal_close_session", { sessionId: execSessionId });
    setExecTarget(null);
    setExecSessionId(null);
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

  function handleModeChange(next: ConnectionMode) {
    setMode(next);
    void setKubeMode(next);
  }

  function updateManualField<K extends keyof KubeManualConnection>(field: K, value: KubeManualConnection[K]) {
    handleManualConnectionChange({ ...manualConnection, [field]: value });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background px-6 py-4">
        <div>
          <h1 className="font-heading text-lg font-medium">Kubernetes Manager</h1>
          <p className="text-sm text-muted-foreground">
            Browse and manage pods, deployments, and services
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

          <Tabs value={kind} onValueChange={(v) => setKind(v as K8sKind)}>
            <TabsList>
              {KINDS.map((k) => (
                <TabsTrigger key={k} value={k}>
                  {k}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <Tabs value={mode} onValueChange={(v) => handleModeChange(v as ConnectionMode)}>
            <TabsList>
              <TabsTrigger value="cli">CLI</TabsTrigger>
              <TabsTrigger value="api">Direct API</TabsTrigger>
            </TabsList>
          </Tabs>

          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
        {connectionSource === "manual" && (
          <div className="flex flex-wrap items-center gap-2">
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
        {mode === "api" && (
          <p className="-mt-2 text-xs text-muted-foreground">
            Direct API mode needs no <code>kubectl</code>, but only supports plain client-cert/bearer-token
            kubeconfig auth (not exec-based cloud CLI plugins), and shows raw resource JSON instead of{" "}
            <code>kubectl describe</code>'s formatted summary.
          </p>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-1.5">
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by name or namespace..."
                className="pl-8"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
              <div className="divide-y">
                {!ready ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground">
                    <Boxes className="size-6" />
                    {connectionSource === "manual"
                      ? "Enter a server URL above to connect."
                      : "Select a context above to browse resources."}
                  </div>
                ) : (
                  filtered.length === 0 && (
                    <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground">
                      <Boxes className="size-6" />
                      No {kind} found.
                    </div>
                  )
                )}
                {filtered.map((r) => (
                  <button
                    key={`${r.namespace}/${r.name}`}
                    onClick={() => setSelectedName(r.name)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 ${
                      selectedName === r.name ? "bg-muted" : ""
                    }`}
                  >
                    <Badge variant="outline" className={statusColorClass(kind, r.status)}>
                      {r.status}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-sm">{r.name}</div>
                      {namespace === ALL_NAMESPACES && (
                        <div className="truncate text-xs text-muted-foreground">{r.namespace}</div>
                      )}
                    </div>
                    {kind === "pods" && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openExec(r);
                        }}
                        aria-label="Exec into pod"
                      >
                        <SquareTerminal />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(r);
                      }}
                      aria-label="Delete resource"
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
              <>
                {kind === "deployments" && (
                  <div className="flex items-center gap-2">
                    <Input
                      value={scaleValue}
                      onChange={(e) => setScaleValue(e.target.value)}
                      placeholder="Replicas"
                      className="w-28"
                      inputMode="numeric"
                    />
                    <Button variant="outline" onClick={() => void handleScale()} disabled={!scaleValue}>
                      Scale
                    </Button>
                  </div>
                )}
                <Tabs value={detailTab} onValueChange={setDetailTab} className="flex min-h-0 flex-1 flex-col gap-1.5">
                  <TabsList>
                    <TabsTrigger value="describe">Describe</TabsTrigger>
                    <TabsTrigger value="edit">Edit</TabsTrigger>
                  </TabsList>
                  <TabsContent value="describe" className="min-h-0 flex-1">
                    <pre className="h-full min-h-0 flex-1 overflow-auto rounded-lg border bg-transparent px-2.5 py-2 font-mono text-xs whitespace-pre-wrap break-words">
                      {describeText || "Loading..."}
                    </pre>
                  </TabsContent>
                  <TabsContent value="edit" className="flex min-h-0 flex-1 flex-col gap-1.5">
                    <p className="text-xs text-muted-foreground">
                      Saves via a full replace, same as <code>kubectl apply</code>/<code>kubectl edit</code>.
                      Fields the API server treats as immutable (most of a running Pod's <code>spec</code>,
                      for instance) will be rejected with an error rather than silently ignored.
                    </p>
                    <div className="relative shrink-0">
                      <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={manifestQuery}
                        onChange={(e) => setManifestQuery(e.target.value)}
                        placeholder="Search manifest..."
                        className="h-8 pl-8 text-xs"
                      />
                    </div>
                    <div className="flex max-h-[45%] shrink-0 flex-col gap-1.5 overflow-y-auto">
                      {sectionResults.map((s) => (
                        <Collapsible
                          key={s.key}
                          defaultOpen
                          className={`overflow-hidden rounded-lg border border-l-4 ${sectionAccent(s.key)} ${
                            manifestQuery && s.matchCount === 0 ? "opacity-50" : ""
                          }`}
                        >
                          <CollapsibleTrigger className="flex w-full items-center justify-between px-2.5 py-1.5 text-xs font-semibold uppercase hover:bg-muted/50">
                            <span>{s.key}</span>
                            {manifestQuery && (
                              <span className="text-xs font-normal text-muted-foreground normal-case">
                                {s.matchCount} match{s.matchCount === 1 ? "" : "es"}
                              </span>
                            )}
                          </CollapsibleTrigger>
                          <CollapsibleContent className="max-h-48 overflow-auto border-t px-2.5 py-2 font-mono text-xs whitespace-pre-wrap break-words">
                            {s.segments.map((segment, i) => (
                              <span
                                key={i}
                                className={
                                  (TOKEN_CLASSES[segment.kind] || "") +
                                  (segment.isMatch ? " rounded-sm bg-yellow-300/60 dark:bg-yellow-500/40" : "")
                                }
                              >
                                {segment.text}
                              </span>
                            ))}
                          </CollapsibleContent>
                        </Collapsible>
                      ))}
                    </div>
                    <Textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      spellCheck={false}
                      className="h-full min-h-0 flex-1 resize-none font-mono text-xs"
                    />
                    <Button variant="outline" onClick={() => void handleSaveManifest()} className="w-fit">
                      Save
                    </Button>
                  </TabsContent>
                </Tabs>
              </>
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border text-center text-sm text-muted-foreground">
                Select a resource to view details
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        resourceLabel={deleteTarget?.name ?? ""}
        onConfirm={handleDelete}
      />

      <Sheet open={execTarget !== null} onOpenChange={(open) => !open && closeExec()}>
        <SheetContent className="flex w-full flex-col gap-0 sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{execTarget && `Exec into ${execTarget.name}`}</SheetTitle>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-4">
            {execError && (
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>Couldn't start exec session</AlertTitle>
                <AlertDescription>{execError}</AlertDescription>
              </Alert>
            )}
            {mode !== "cli" ? (
              <Alert>
                <TriangleAlert />
                <AlertTitle>Exec requires CLI mode</AlertTitle>
                <AlertDescription>
                  Direct API mode has no equivalent to kubectl's exec protocol. Switch to CLI mode to exec
                  into a pod.
                </AlertDescription>
              </Alert>
            ) : execSessionId === null ? (
              <div className="flex flex-col gap-2">
                <Input
                  value={execContainer}
                  onChange={(e) => setExecContainer(e.target.value)}
                  placeholder="Container (optional, defaults to the pod's first container)"
                />
                <Input
                  value={execShell}
                  onChange={(e) => setExecShell(e.target.value)}
                  placeholder="Shell"
                  className="font-mono"
                />
                <Button onClick={() => void handleStartExec()} className="w-fit">
                  Start
                </Button>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-hidden rounded-lg border">
                <TerminalPane sessionId={execSessionId} active />
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
