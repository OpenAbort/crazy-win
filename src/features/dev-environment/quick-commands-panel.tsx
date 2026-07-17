import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Redo2, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDeleteDialog } from "@/features/dev-environment/confirm-delete-dialog";
import {
  addQuickCommand,
  getQuickCommands,
  removeQuickCommand,
  updateQuickCommand,
  type QuickCommand,
} from "@/features/dev-environment/quick-commands-store";

export function QuickCommandsPanel({
  namespace,
  activeSessionId,
  onSend,
}: {
  namespace: string;
  activeSessionId: number | null;
  onSend: (command: string) => void;
}) {
  const [commands, setCommands] = useState<QuickCommand[]>([]);
  const [draft, setDraft] = useState("");
  const [draftAlias, setDraftAlias] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCommand, setEditCommand] = useState("");
  const [editAlias, setEditAlias] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<QuickCommand | null>(null);

  useEffect(() => {
    void getQuickCommands(namespace).then(setCommands);
  }, [namespace]);

  async function handleAdd() {
    const command = draft.trim();
    if (!command) return;
    setCommands(await addQuickCommand(namespace, command, draftAlias.trim() || undefined));
    setDraft("");
    setDraftAlias("");
  }

  async function handleRemove(id: string) {
    setCommands(await removeQuickCommand(namespace, id));
  }

  function handleReuse(command: string) {
    setDraft(command);
  }

  function handleSendAgain(command: string) {
    if (activeSessionId === null) return;
    onSend(command);
  }

  function startEdit(c: QuickCommand) {
    setEditingId(c.id);
    setEditCommand(c.command);
    setEditAlias(c.alias ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    const command = editCommand.trim();
    if (!command) return;
    setCommands(await updateQuickCommand(namespace, id, { command, alias: editAlias.trim() || undefined }));
    setEditingId(null);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <h3 className="text-sm font-medium">Quick commands</h3>
      <div className="flex items-center gap-1.5">
        <Input
          value={draftAlias}
          onChange={(e) => setDraftAlias(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void handleAdd()}
          placeholder="Name (optional)"
          className="w-28 shrink-0 text-xs"
        />
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void handleAdd()}
          placeholder="Save a command"
          className="font-mono text-xs"
        />
        <Button variant="outline" size="icon-sm" onClick={() => void handleAdd()} aria-label="Save command">
          <Plus />
        </Button>
      </div>
      {commands.length === 0 && <p className="text-xs text-muted-foreground">No saved commands yet.</p>}
      <div className="flex flex-col gap-1">
        {commands.map((c) =>
          editingId === c.id ? (
            <div key={c.id} className="flex items-center gap-1.5 rounded-md border px-2 py-1">
              <Input
                value={editAlias}
                onChange={(e) => setEditAlias(e.target.value)}
                placeholder="Name (optional)"
                className="w-28 shrink-0 text-xs"
              />
              <Input
                value={editCommand}
                onChange={(e) => setEditCommand(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void saveEdit(c.id)}
                className="min-w-0 flex-1 font-mono text-xs"
              />
              <Button variant="ghost" size="icon-sm" onClick={() => void saveEdit(c.id)} aria-label="Save">
                <Check />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={cancelEdit} aria-label="Cancel">
                <X />
              </Button>
            </div>
          ) : (
            <div key={c.id} className="flex items-center gap-1.5 rounded-md border px-2 py-1">
              <div className="min-w-0 flex-1" title={c.command}>
                {c.alias ? (
                  <>
                    <div className="truncate text-xs font-semibold">{c.alias}</div>
                    <div className="truncate font-mono text-[11px] text-muted-foreground">{c.command}</div>
                  </>
                ) : (
                  <span className="block truncate font-mono text-xs">{c.command}</span>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleReuse(c.command)}>
                Reuse
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={activeSessionId === null}
                onClick={() => handleSendAgain(c.command)}
                aria-label="Send again"
              >
                <Redo2 />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => startEdit(c)} aria-label="Edit">
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(c)} aria-label="Remove">
                <Trash2 />
              </Button>
            </div>
          ),
        )}
      </div>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        resourceLabel={deleteTarget?.alias || deleteTarget?.command || ""}
        actionLabel="Remove"
        onConfirm={async () => {
          if (deleteTarget) await handleRemove(deleteTarget.id);
        }}
      />
    </div>
  );
}
