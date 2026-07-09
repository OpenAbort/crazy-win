import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import {
  Download,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  appendEnvVar,
  filterEnvVars,
  parseEnvVars,
  removeEnvLine,
  replaceEnvVar,
  type EnvVar,
} from "@/features/window-manager/env";

type Scope = "user" | "system";

type ScopeState = {
  content: string;
  original: string;
  loaded: boolean;
  loading: boolean;
  saving: boolean;
  exporting: boolean;
  error: string | null;
  status: string | null;
  query: string;
};

function emptyScopeState(): ScopeState {
  return {
    content: "",
    original: "",
    loaded: false,
    loading: false,
    saving: false,
    exporting: false,
    error: null,
    status: null,
    query: "",
  };
}

export function EnvEditor() {
  const [scope, setScope] = useState<Scope>("user");
  const [states, setStates] = useState<Record<Scope, ScopeState>>({
    user: emptyScopeState(),
    system: emptyScopeState(),
  });

  const current = states[scope];
  const items = parseEnvVars(current.content);
  const filteredItems = filterEnvVars(items, current.query);
  const dirty = current.content !== current.original;

  function patchScope(target: Scope, patch: Partial<ScopeState>) {
    setStates((prev) => ({ ...prev, [target]: { ...prev[target], ...patch } }));
  }

  async function load(target: Scope) {
    patchScope(target, { loading: true, error: null, status: null });
    try {
      const text = await invoke<string>("read_env_vars", { scope: target });
      patchScope(target, { content: text, original: text, loaded: true });
    } catch (e) {
      patchScope(target, { error: String(e), loaded: true });
    } finally {
      patchScope(target, { loading: false });
    }
  }

  async function saveScope() {
    patchScope(scope, { saving: true, error: null, status: null });
    try {
      await invoke("write_env_vars", { scope, content: current.content });
      patchScope(scope, {
        original: current.content,
        status:
          scope === "system"
            ? "Saved (restart other apps to see changes)"
            : "Saved",
      });
    } catch (e) {
      patchScope(scope, { error: String(e) });
    } finally {
      patchScope(scope, { saving: false });
    }
  }

  async function exportBackup() {
    patchScope(scope, { exporting: true, error: null, status: null });
    try {
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const path = await save({
        defaultPath: `env-${scope}-backup-${timestamp}.txt`,
        filters: [{ name: "Text", extensions: ["txt"] }],
      });
      if (!path) return;
      await invoke("export_text_backup", { path, content: current.content });
      patchScope(scope, { status: "Backup exported" });
    } catch (e) {
      patchScope(scope, { error: String(e) });
    } finally {
      patchScope(scope, { exporting: false });
    }
  }

  useEffect(() => {
    if (!states[scope].loaded && !states[scope].loading) {
      void load(scope);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  function update(next: string) {
    patchScope(scope, { content: next, status: null });
  }

  function changeValue(entry: EnvVar, newValue: string) {
    update(replaceEnvVar(current.content, entry.lineIndex, { ...entry, value: newValue }));
  }

  function deleteEntry(entry: EnvVar) {
    update(removeEnvLine(current.content, entry.lineIndex));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background px-6 py-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-lg font-medium">Env Editor</h1>
            <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
              <TabsList>
                <TabsTrigger value="user">User</TabsTrigger>
                <TabsTrigger value="system">System</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <p className="text-sm text-muted-foreground">
            {items.length} {items.length === 1 ? "variable" : "variables"}
            {dirty && (
              <span className="ml-2 text-amber-500">• Unsaved changes</span>
            )}
            {current.status && !dirty && (
              <span className="ml-2 text-emerald-500">• {current.status}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void exportBackup()}
            disabled={current.loading || current.exporting}
          >
            {current.exporting ? <LoaderCircle className="animate-spin" /> : <Download />}
            Export
          </Button>
          <Button
            variant="outline"
            onClick={() => void load(scope)}
            disabled={current.loading || current.saving}
          >
            <RefreshCw className={cn(current.loading && "animate-spin")} />
            Reload
          </Button>
          <Button
            onClick={() => void saveScope()}
            disabled={!dirty || current.saving || current.loading}
          >
            {current.saving ? <LoaderCircle className="animate-spin" /> : <Save />}
            Save
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-6">
        {current.error && (
          <Alert variant="destructive" className="mb-4">
            <TriangleAlert />
            <AlertTitle>
              Couldn't access {scope === "system" ? "system" : "user"} environment variables
            </AlertTitle>
            <AlertDescription>{current.error}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="entries" className="flex min-h-0 flex-1 flex-col">
          <TabsList>
            <TabsTrigger value="entries">Entries</TabsTrigger>
            <TabsTrigger value="raw">Raw</TabsTrigger>
          </TabsList>

          <TabsContent value="entries" className="min-h-0 flex-1 overflow-hidden">
            <EntriesTab
              vars={filteredItems}
              query={current.query}
              onQueryChange={(query) => patchScope(scope, { query })}
              onChangeValue={changeValue}
              onDelete={deleteEntry}
              onAdd={(entry) => update(appendEnvVar(current.content, entry))}
            />
          </TabsContent>

          <TabsContent value="raw" className="min-h-0 flex-1 overflow-hidden">
            <Textarea
              value={current.content}
              onChange={(e) => update(e.target.value)}
              spellCheck={false}
              className="h-full min-h-0 resize-none font-mono text-xs"
              placeholder="NAME=value"
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

type EntriesTabProps = {
  vars: EnvVar[];
  query: string;
  onQueryChange: (query: string) => void;
  onChangeValue: (entry: EnvVar, newValue: string) => void;
  onDelete: (entry: EnvVar) => void;
  onAdd: (entry: Omit<EnvVar, "lineIndex">) => void;
};

function EntriesTab({
  vars,
  query,
  onQueryChange,
  onChangeValue,
  onDelete,
  onAdd,
}: EntriesTabProps) {
  const listRef = useRef<HTMLDivElement>(null);

  function jumpToAdd() {
    const list = listRef.current;
    if (list) {
      list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    }
    requestAnimationFrame(() =>
      document.getElementById("env-add-name")?.focus(),
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
            placeholder="Search name or value..."
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
          {vars.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
              <Settings2 className="size-6" />
              {query.trim()
                ? `No matches for "${query.trim()}"`
                : "No variables yet. Add one below."}
            </div>
          )}

          {vars.map((item) => (
            <div key={item.lineIndex} className="flex items-center gap-3 px-3 py-2">
              <span className="w-56 shrink-0 truncate font-mono text-sm">{item.name}</span>
              <Input
                value={item.value}
                onChange={(e) => onChangeValue(item, e.target.value)}
                className="flex-1 font-mono text-sm"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onDelete(item)}
                aria-label="Delete variable"
              >
                <Trash2 />
              </Button>
            </div>
          ))}

          <AddEntryForm onAdd={onAdd} />
        </div>
      </div>
    </div>
  );
}

function AddEntryForm({
  onAdd,
}: {
  onAdd: (entry: Omit<EnvVar, "lineIndex">) => void;
}) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");

  const canAdd = name.trim() !== "";

  function submit() {
    if (!canAdd) return;
    onAdd({ name: name.trim(), value });
    setName("");
    setValue("");
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
        id="env-add-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="NAME"
        className="w-56 font-mono text-sm"
      />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="value"
        className="flex-1 font-mono text-sm"
      />
      <Button type="submit" disabled={!canAdd}>
        <Plus />
        Add
      </Button>
    </form>
  );
}
