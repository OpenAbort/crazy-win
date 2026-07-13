import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Network, RefreshCw, Search, Trash2, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDeleteDialog } from "@/features/dev-environment/confirm-delete-dialog";
import {
  DEFAULT_NETWORKS,
  filterNetworks,
  parseInspect,
  parseNetworkList,
  type DockerNetworkSummary,
} from "@/features/dev-environment/docker-manager-logic";
import type { ConnectionMode } from "@/features/dev-environment/dev-environment-store";
import { JsonDetailPane, SearchToolbar, useContentSearch } from "@/features/dev-environment/json-detail-pane";

export function DockerNetworksPanel({ host, mode }: { host: string; mode: ConnectionMode }) {
  const [networks, setNetworks] = useState<DockerNetworkSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspectText, setInspectText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DockerNetworkSummary | null>(null);

  const detailSearch = useContentSearch("json", inspectText);
  const filtered = useMemo(() => filterNetworks(networks, query), [networks, query]);
  const selected = useMemo(() => networks.find((n) => n.ID === selectedId) ?? null, [networks, selectedId]);

  useEffect(() => {
    void refresh();
  }, [host, mode]);

  useEffect(() => {
    if (!selected) {
      setInspectText("");
      return;
    }
    void loadInspect(selected.ID);
  }, [selected?.ID]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const raw = await invoke<string>("docker_list_networks", { host, mode });
      setNetworks(parseNetworkList(raw));
    } catch (e) {
      setError(String(e));
      setNetworks([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadInspect(id: string) {
    try {
      const raw = await invoke<string>("docker_inspect_network", { host, id, mode });
      setInspectText(JSON.stringify(parseInspect(raw), null, 2));
    } catch (e) {
      setInspectText(`Failed to inspect: ${String(e)}`);
    }
  }

  async function handleRemove() {
    if (!deleteTarget) return;
    await invoke("docker_remove_network", { host, id: deleteTarget.ID, mode });
    if (selectedId === deleteTarget.ID) setSelectedId(null);
    await refresh();
  }

  function isDefaultNetwork(n: DockerNetworkSummary) {
    return DEFAULT_NETWORKS.has(n.Name);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex min-h-0 flex-col gap-1.5">
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name, driver, or id..."
              className="pl-8"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
            <div className="divide-y">
              {filtered.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground">
                  <Network className="size-6" />
                  No networks found.
                </div>
              )}
              {filtered.map((n) => (
                <button
                  key={n.ID}
                  onClick={() => setSelectedId(n.ID)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 ${
                    selectedId === n.ID ? "bg-muted" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-sm">{n.Name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {n.Driver} · {n.Scope}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(n);
                    }}
                    disabled={isDefaultNetwork(n)}
                    title={isDefaultNetwork(n) ? "Default network can't be removed" : undefined}
                    aria-label="Remove network"
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
            <div className="flex min-h-0 flex-1 flex-col gap-1.5">
              <div className="flex items-center justify-end gap-2">
                <SearchToolbar
                  query={detailSearch.query}
                  onQueryChange={detailSearch.setQuery}
                  matchCount={detailSearch.matchCount}
                  currentMatch={detailSearch.currentMatch}
                  onStep={detailSearch.stepMatch}
                />
              </div>
              <JsonDetailPane
                content={inspectText}
                segments={detailSearch.segments}
                currentMatch={detailSearch.currentMatch}
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border text-center text-sm text-muted-foreground">
              Select a network to view details
            </div>
          )}
        </div>
      </div>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        resourceLabel={deleteTarget?.Name ?? ""}
        actionLabel="Remove"
        onConfirm={handleRemove}
      />
    </div>
  );
}
