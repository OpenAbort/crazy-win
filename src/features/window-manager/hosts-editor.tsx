import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import {
  Download,
  LoaderCircle,
  Network,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  appendEntry,
  filterHostItems,
  parseHostItems,
  removeLine,
  replaceEntry,
  type HostEntry,
  type HostsItem,
} from "@/features/window-manager/hosts";

export function HostsEditor() {
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [query, setQuery] = useState("");

  const items = useMemo(() => parseHostItems(content), [content]);
  const filteredItems = useMemo(
    () => filterHostItems(items, query),
    [items, query],
  );
  const entryCount = useMemo(
    () => items.filter((item) => item.kind === "entry").length,
    [items],
  );
  const dirty = content !== original;

  async function load() {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const text = await invoke<string>("read_hosts");
      setContent(text);
      setOriginal(text);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function saveHosts() {
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      await invoke("write_hosts", { content });
      setOriginal(content);
      setStatus("Saved");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function exportBackup() {
    setExporting(true);
    setError(null);
    setStatus(null);
    try {
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const path = await save({
        defaultPath: `hosts-backup-${timestamp}.txt`,
        filters: [{ name: "Text", extensions: ["txt"] }],
      });
      if (!path) return;
      await invoke("export_text_backup", { path, content });
      setStatus("Backup exported");
    } catch (e) {
      setError(String(e));
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function update(next: string) {
    setContent(next);
    setStatus(null);
  }

  function toggleEntry(entry: HostEntry) {
    update(
      replaceEntry(content, entry.lineIndex, {
        ...entry,
        enabled: !entry.enabled,
      }),
    );
  }

  function deleteEntry(entry: HostEntry) {
    update(removeLine(content, entry.lineIndex));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background px-6 py-4">
        <div>
          <h1 className="font-heading text-lg font-medium">Hosts File Editor</h1>
          <p className="text-sm text-muted-foreground">
            {entryCount} {entryCount === 1 ? "entry" : "entries"}
            {dirty && (
              <span className="ml-2 text-amber-500">• Unsaved changes</span>
            )}
            {status && !dirty && (
              <span className="ml-2 text-emerald-500">• {status}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void exportBackup()}
            disabled={loading || exporting}
          >
            {exporting ? <LoaderCircle className="animate-spin" /> : <Download />}
            Export
          </Button>
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading || saving}
          >
            <RefreshCw className={cn(loading && "animate-spin")} />
            Reload
          </Button>
          <Button onClick={() => void saveHosts()} disabled={!dirty || saving || loading}>
            {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
            Save
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-6">
        {error && (
          <Alert variant="destructive" className="mb-4">
            <TriangleAlert />
            <AlertTitle>Couldn't access the hosts file</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="entries" className="flex min-h-0 flex-1 flex-col">
          <TabsList>
            <TabsTrigger value="entries">Entries</TabsTrigger>
            <TabsTrigger value="raw">Raw</TabsTrigger>
          </TabsList>

          <TabsContent value="entries" className="min-h-0 flex-1 overflow-hidden">
            <EntriesTab
              items={filteredItems}
              query={query}
              onQueryChange={setQuery}
              onToggle={toggleEntry}
              onDelete={deleteEntry}
              onAdd={(entry) => update(appendEntry(content, entry))}
            />
          </TabsContent>

          <TabsContent value="raw" className="min-h-0 flex-1 overflow-hidden">
            <Textarea
              value={content}
              onChange={(e) => update(e.target.value)}
              spellCheck={false}
              className="h-full min-h-0 resize-none font-mono text-xs"
              placeholder="# IP_ADDRESS  hostname"
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

type EntriesTabProps = {
  items: HostsItem[];
  query: string;
  onQueryChange: (query: string) => void;
  onToggle: (entry: HostEntry) => void;
  onDelete: (entry: HostEntry) => void;
  onAdd: (entry: Omit<HostEntry, "lineIndex">) => void;
};

function EntriesTab({
  items,
  query,
  onQueryChange,
  onToggle,
  onDelete,
  onAdd,
}: EntriesTabProps) {
  const listRef = useRef<HTMLDivElement>(null);

  function jumpToAdd() {
    const list = listRef.current;
    if (list) {
      list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    }
    // Defer focus so it wins over the smooth scroll's own scrolling.
    requestAnimationFrame(() =>
      document.getElementById("hosts-add-ip")?.focus(),
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search IP, hostname, or comment..."
            className="pl-8"
          />
        </div>
        <Button variant="outline" onClick={jumpToAdd}>
          <Plus />
          Add entry
        </Button>
      </div>

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto rounded-lg border"
      >
        <div className="divide-y">
          {items.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
              <Network className="size-6" />
              {query.trim()
                ? `No matches for "${query.trim()}"`
                : "No host entries yet. Add one below."}
            </div>
          )}

          {items.map((item) =>
            item.kind === "section" ? (
              <div
                key={item.lineIndex}
                className="bg-muted/40 px-3 py-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase"
              >
                {item.text}
              </div>
            ) : (
              <div
                key={item.lineIndex}
                className="flex items-center gap-3 px-3 py-2"
              >
                <Switch
                  checked={item.enabled}
                  onCheckedChange={() => onToggle(item)}
                  aria-label={item.enabled ? "Disable entry" : "Enable entry"}
                />
                <div
                  className={cn(
                    "flex min-w-0 flex-1 items-baseline gap-3 font-mono text-sm",
                    !item.enabled && "text-muted-foreground line-through",
                  )}
                >
                  <span className="w-32 shrink-0 truncate">{item.ip}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {item.hostnames.join(" ")}
                  </span>
                  {item.comment && (
                    <span className="truncate text-xs text-muted-foreground not-italic">
                      # {item.comment}
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onDelete(item)}
                  aria-label="Delete entry"
                >
                  <Trash2 />
                </Button>
              </div>
            ),
          )}

          <AddEntryForm onAdd={onAdd} />
        </div>
      </div>
    </div>
  );
}

function AddEntryForm({
  onAdd,
}: {
  onAdd: (entry: Omit<HostEntry, "lineIndex">) => void;
}) {
  const [ip, setIp] = useState("");
  const [hostnames, setHostnames] = useState("");
  const [comment, setComment] = useState("");

  const canAdd = ip.trim() !== "" && hostnames.trim() !== "";

  function submit() {
    if (!canAdd) return;
    onAdd({
      enabled: true,
      ip: ip.trim(),
      hostnames: hostnames.trim().split(/\s+/).filter(Boolean),
      comment: comment.trim(),
    });
    setIp("");
    setHostnames("");
    setComment("");
  }

  return (
    <form
      className="flex items-center gap-2 bg-muted/30 px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Input
        id="hosts-add-ip"
        value={ip}
        onChange={(e) => setIp(e.target.value)}
        placeholder="127.0.0.1"
        className="w-36 font-mono text-sm"
      />
      <Input
        value={hostnames}
        onChange={(e) => setHostnames(e.target.value)}
        placeholder="example.local"
        className="flex-1 font-mono text-sm"
      />
      <Input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="comment (optional)"
        className="w-48 text-sm"
      />
      <Button type="submit" disabled={!canAdd}>
        <Plus />
        Add
      </Button>
    </form>
  );
}
