import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  parseHelmCommand,
  serializeHelmCommand,
  type FlagToken,
  type ParsedHelmCommand,
  type SetEntry,
  type SetMode,
  type TargetOs,
} from "@/features/dev-tools/helm-formatter-logic";

const PLACEHOLDER =
  "helm upgrade myrelease ./chart \\\n  --install \\\n  --set image.tag=v2";

const SET_MODES: SetMode[] = ["set", "set-string", "set-json", "set-file"];

export function HelmFormatter() {
  const [rawInput, setRawInput] = useState("");
  const [parsed, setParsed] = useState<ParsedHelmCommand>({ baseCommand: [], flags: [] });
  const [os, setOs] = useState<TargetOs>("linux");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setParsed(parseHelmCommand(rawInput));
    }, 300);
    return () => clearTimeout(timer);
  }, [rawInput]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const output = useMemo(
    () => serializeHelmCommand(parsed.baseCommand, parsed.flags, os),
    [parsed, os],
  );

  const setEntries = useMemo(
    () => parsed.flags.filter((f): f is SetEntry => f.kind === "set"),
    [parsed.flags],
  );

  function updateFlags(next: FlagToken[]) {
    setParsed((prev) => ({ ...prev, flags: next }));
  }

  function updateEntry(id: string, patch: Partial<Pick<SetEntry, "key" | "value">>) {
    updateFlags(
      parsed.flags.map((f) => (f.kind === "set" && f.id === id ? { ...f, ...patch } : f)),
    );
  }

  function deleteEntry(id: string) {
    updateFlags(parsed.flags.filter((f) => !(f.kind === "set" && f.id === id)));
  }

  function addEntry(entry: Omit<SetEntry, "id" | "kind">) {
    updateFlags([...parsed.flags, { kind: "set", id: crypto.randomUUID(), ...entry }]);
  }

  async function copyOutput() {
    await navigator.clipboard.writeText(output);
    setCopied(true);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background px-6 py-4">
        <div>
          <h1 className="font-heading text-lg font-medium">Helm Formatter</h1>
          <p className="text-sm text-muted-foreground">
            Tidy multi-line helm commands and edit --set values
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={os} onValueChange={(v) => setOs(v as TargetOs)}>
            <TabsList>
              <TabsTrigger value="linux">Linux</TabsTrigger>
              <TabsTrigger value="windows">Windows</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" onClick={() => void copyOutput()} disabled={!output}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        <div className="flex h-40 shrink-0 flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground uppercase">Command</span>
          <Textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            spellCheck={false}
            placeholder={PLACEHOLDER}
            className="h-full min-h-0 resize-none font-mono text-xs"
          />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase">Set Values</span>
            <SetValuesList
              entries={setEntries}
              onUpdate={updateEntry}
              onDelete={deleteEntry}
              onAdd={addEntry}
            />
          </div>

          <div className="flex min-h-0 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase">
              Formatted Output
            </span>
            <Textarea
              value={output}
              readOnly
              spellCheck={false}
              placeholder="Formatted command appears here"
              className="h-full min-h-0 resize-none font-mono text-xs"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

type SetValuesListProps = {
  entries: SetEntry[];
  onUpdate: (id: string, patch: Partial<Pick<SetEntry, "key" | "value">>) => void;
  onDelete: (id: string) => void;
  onAdd: (entry: Omit<SetEntry, "id" | "kind">) => void;
};

function SetValuesList({ entries, onUpdate, onDelete, onAdd }: SetValuesListProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
      <div className="min-h-0 flex-1 overflow-y-auto divide-y">
        {entries.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            Paste a helm command above, or add a value below.
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 px-3 py-2">
              <span className="w-20 shrink-0 font-mono text-[10px] text-muted-foreground">
                --{entry.mode}
              </span>
              <Input
                value={entry.key}
                onChange={(e) => onUpdate(entry.id, { key: e.target.value })}
                className="flex-1 font-mono text-sm"
              />
              {entry.valueKind === "bool" ? (
                <Switch
                  checked={entry.value === "true"}
                  onCheckedChange={(checked) => onUpdate(entry.id, { value: String(checked) })}
                />
              ) : (
                <Input
                  value={entry.value}
                  onChange={(e) => onUpdate(entry.id, { value: e.target.value })}
                  className="flex-1 font-mono text-sm"
                />
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onDelete(entry.id)}
                aria-label="Delete value"
              >
                <Trash2 />
              </Button>
            </div>
          ))
        )}
      </div>
      <div className="border-t">
        <AddSetEntryForm onAdd={onAdd} />
      </div>
    </div>
  );
}

function AddSetEntryForm({
  onAdd,
}: {
  onAdd: (entry: Omit<SetEntry, "id" | "kind">) => void;
}) {
  const [mode, setMode] = useState<SetMode>("set");
  const [key, setKey] = useState("");
  const [isBool, setIsBool] = useState(false);
  const [value, setValue] = useState("");
  const [boolValue, setBoolValue] = useState(false);

  const canAdd = key.trim() !== "";

  function submit() {
    if (!canAdd) return;
    onAdd({
      mode,
      key: key.trim(),
      value: isBool ? String(boolValue) : value,
      valueKind: isBool ? "bool" : "string",
    });
    setKey("");
    setValue("");
    setBoolValue(false);
    setIsBool(false);
  }

  return (
    <form
      className="flex flex-col gap-2 bg-muted/30 px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Tabs value={mode} onValueChange={(v) => setMode(v as SetMode)}>
        <TabsList>
          {SET_MODES.map((m) => (
            <TabsTrigger key={m} value={m}>
              {m}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="flex items-center gap-2">
        <Input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="key"
          className="w-48 font-mono text-sm"
        />
        {isBool ? (
          <Switch checked={boolValue} onCheckedChange={setBoolValue} />
        ) : (
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="value"
            className="flex-1 font-mono text-sm"
          />
        )}
        <label className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
          <Switch checked={isBool} onCheckedChange={setIsBool} />
          Bool
        </label>
        <Button type="submit" disabled={!canAdd}>
          <Plus />
          Add
        </Button>
      </div>
    </form>
  );
}
