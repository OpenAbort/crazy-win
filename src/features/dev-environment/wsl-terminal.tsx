import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Plus, SquareTerminal, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ensureWslOutputRouter } from "@/features/dev-environment/wsl-terminal-logic";
import { getLastWslDistro, getWslLastCwd, setLastWslDistro, setWslLastCwd } from "@/features/dev-environment/wsl-store";
import { WslQuickCommands } from "@/features/dev-environment/wsl-quick-commands";
import { WslTerminalPane } from "@/features/dev-environment/wsl-terminal-pane";
import { WslTerminalTabs, type WslTab } from "@/features/dev-environment/wsl-terminal-tabs";

export function WslTerminal() {
  const [wslAvailable, setWslAvailable] = useState<boolean | null>(null);
  const [distros, setDistros] = useState<string[]>([]);
  const [selectedDistro, setSelectedDistro] = useState<string>("");
  const [pendingCwd, setPendingCwd] = useState<string | null>(null);
  const [tabs, setTabs] = useState<WslTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [nextLabel, setNextLabel] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Attach the global output router before any session can start, so no
    // early output (the shell's initial prompt) is dropped on the floor.
    ensureWslOutputRouter();
    void initialize();
  }, []);

  async function initialize() {
    try {
      const list = await invoke<string[]>("wsl_list_distros");
      setDistros(list);
      setWslAvailable(true);
      const lastDistro = await getLastWslDistro();
      setSelectedDistro((lastDistro && list.includes(lastDistro) ? lastDistro : list[0]) ?? "");
    } catch {
      setWslAvailable(false);
    }
  }

  async function handleNewTab() {
    setError(null);
    try {
      const distro = selectedDistro || undefined;
      const cwd = pendingCwd ?? undefined;
      const sessionId = await invoke<number>("wsl_start_session", { distro, cwd });
      setTabs((prev) => [...prev, { id: sessionId, label: `${distro ?? "WSL"} ${nextLabel}` }]);
      setActiveTabId(sessionId);
      setNextLabel((n) => n + 1);
      if (distro) void setLastWslDistro(distro);
      if (distro && pendingCwd) void setWslLastCwd(distro, pendingCwd);
      setPendingCwd(null);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleCloseTab(id: number) {
    await invoke("wsl_close_session", { sessionId: id });
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeTabId === id) setActiveTabId(next.length > 0 ? next[next.length - 1].id : null);
      return next;
    });
  }

  async function handlePickWorkingDirectory() {
    const picked = await open({ directory: true });
    if (!picked || Array.isArray(picked)) return;
    try {
      const wslPath = await invoke<string>("wsl_windows_path_to_wsl", { path: picked });
      setPendingCwd(wslPath);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    if (selectedDistro) {
      void getWslLastCwd(selectedDistro).then((cwd) => {
        if (cwd) setPendingCwd(cwd);
      });
    }
  }, [selectedDistro]);

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background px-6 py-4">
        <div>
          <h1 className="font-heading text-lg font-medium">WSL Terminal</h1>
          <p className="text-sm text-muted-foreground">Interactive WSL shell with tabs and quick commands</p>
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

        {wslAvailable === false && (
          <Alert>
            <SquareTerminal />
            <AlertTitle>WSL not found</AlertTitle>
            <AlertDescription>
              Install the Windows Subsystem for Linux to use this tool: <code>wsl --install</code>
            </AlertDescription>
          </Alert>
        )}

        {wslAvailable && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={selectedDistro} onValueChange={setSelectedDistro}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Distro" />
                </SelectTrigger>
                <SelectContent>
                  {distros.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => void handlePickWorkingDirectory()}>
                <FolderOpen />
                {pendingCwd ? pendingCwd : "Working directory"}
              </Button>
              <Button size="sm" onClick={() => void handleNewTab()}>
                <Plus />
                New tab
              </Button>
            </div>

            <WslTerminalTabs
              tabs={tabs}
              activeTabId={activeTabId}
              onSelect={setActiveTabId}
              onClose={(id) => void handleCloseTab(id)}
            />

            <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
              <div className="min-h-0 flex-1 rounded-lg border p-2">
                {tabs.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                    Open a new tab to start a shell
                  </div>
                ) : (
                  tabs.map((tab) => <WslTerminalPane key={tab.id} sessionId={tab.id} active={tab.id === activeTabId} />)
                )}
              </div>
              <div className="lg:w-72 lg:shrink-0">
                <WslQuickCommands activeSessionId={activeTabId} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
