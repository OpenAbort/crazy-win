import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Redo2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addWslQuickCommand, getWslQuickCommands, removeWslQuickCommand, type WslQuickCommand } from "@/features/dev-environment/wsl-store";

export function WslQuickCommands({ activeSessionId }: { activeSessionId: number | null }) {
  const [commands, setCommands] = useState<WslQuickCommand[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    void getWslQuickCommands().then(setCommands);
  }, []);

  async function handleAdd() {
    const command = draft.trim();
    if (!command) return;
    setCommands(await addWslQuickCommand(command));
    setDraft("");
  }

  async function handleRemove(id: string) {
    setCommands(await removeWslQuickCommand(id));
  }

  function handleReuse(command: string) {
    setDraft(command);
  }

  function handleSendAgain(command: string) {
    if (activeSessionId === null) return;
    void invoke("wsl_write", { sessionId: activeSessionId, data: `${command}\n` });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <h3 className="text-sm font-medium">Quick commands</h3>
      <div className="flex items-center gap-1.5">
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
        {commands.map((c) => (
          <div key={c.id} className="flex items-center gap-1.5 rounded-md border px-2 py-1">
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{c.command}</span>
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
            <Button variant="ghost" size="icon-sm" onClick={() => void handleRemove(c.id)} aria-label="Remove">
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
