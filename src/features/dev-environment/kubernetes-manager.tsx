import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Boxes, RefreshCw, Trash2, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  parseContextNames,
  parseNamespaceList,
  parseResourceList,
  type K8sKind,
  type K8sResourceSummary,
} from "@/features/dev-environment/kubernetes-manager-logic";

const ALL_NAMESPACES = "__all__";
const KINDS: K8sKind[] = ["pods", "deployments", "services"];

const DEFAULT_MANUAL_CONNECTION: KubeManualConnection = { server: "", token: "", insecure: false };

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [describeText, setDescribeText] = useState("");
  const [scaleValue, setScaleValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<K8sResourceSummary | null>(null);

  const selected = useMemo(
    () => resources.find((r) => r.name === selectedName) ?? null,
    [resources, selectedName],
  );

  const manualParam = connectionSource === "manual" ? manualConnection : undefined;
  const ready = connectionSource === "manual" ? !!manualConnection.server.trim() : !!context;

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
      return;
    }
    setScaleValue("");
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
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
            <div className="divide-y">
              {resources.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground">
                  <Boxes className="size-6" />
                  No {kind} found.
                </div>
              )}
              {resources.map((r) => (
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
                    {namespace === ALL_NAMESPACES && (
                      <div className="truncate text-xs text-muted-foreground">{r.namespace}</div>
                    )}
                  </div>
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
                <pre className="h-full min-h-0 flex-1 overflow-auto rounded-lg border bg-transparent px-2.5 py-2 font-mono text-xs whitespace-pre-wrap break-words">
                  {describeText || "Loading..."}
                </pre>
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
    </div>
  );
}
