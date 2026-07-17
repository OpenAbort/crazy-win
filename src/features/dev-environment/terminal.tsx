import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Plus, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { QuickCommandsPanel } from "@/features/dev-environment/quick-commands-panel";
import { ensureTerminalOutputRouter } from "@/features/dev-environment/terminal-logic";
import {
  closePane,
  collectSessionIds,
  findFirstSessionId,
  leaf,
  setRatio,
  splitPane,
  type PaneNode,
  type SplitDirection,
} from "@/features/dev-environment/terminal-panes-logic";
import { PaneTree } from "@/features/dev-environment/terminal-pane-tree";
import { getTerminalLastCwd, setTerminalLastCwd } from "@/features/dev-environment/terminal-store";
import { WslTerminalTabs } from "@/features/dev-environment/wsl-terminal-tabs";

interface TerminalTab {
  id: number;
  label: string;
  root: PaneNode;
  activeSessionId: number;
}

// `active` defaults to `true` so this still satisfies the tools registry's
// no-props `ComponentType` (mirrors how `WslTerminal` is registered there but
// actually rendered via App.tsx's dedicated keep-alive wrapper, not through
// the registry's generic `<ActiveComponent />` path).
export function Terminal({ active = true }: { active?: boolean }) {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [nextLabel, setNextLabel] = useState(1);
  const [pendingCwd, setPendingCwd] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Attach the global output router before any session can start, so no
    // early output (the shell's initial prompt) is dropped on the floor.
    ensureTerminalOutputRouter();
    void getTerminalLastCwd().then((cwd) => {
      if (cwd) setPendingCwd(cwd);
    });
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  async function handleNewTab() {
    setError(null);
    try {
      const cwd = pendingCwd ?? undefined;
      const sessionId = await invoke<number>("terminal_start_session", { cwd });
      setTabs((prev) => [...prev, { id: sessionId, label: `Terminal ${nextLabel}`, root: leaf(sessionId), activeSessionId: sessionId }]);
      setActiveTabId(sessionId);
      setNextLabel((n) => n + 1);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleCloseTab(id: number) {
    const tab = tabs.find((t) => t.id === id);
    if (tab) {
      for (const sessionId of collectSessionIds(tab.root)) {
        await invoke("terminal_close_session", { sessionId });
      }
    }
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeTabId === id) setActiveTabId(next.length > 0 ? next[next.length - 1].id : null);
      return next;
    });
  }

  async function handleSplit(tabId: number, sessionId: number, direction: SplitDirection) {
    setError(null);
    try {
      const cwd = pendingCwd ?? undefined;
      const newSessionId = await invoke<number>("terminal_start_session", { cwd });
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId ? { ...t, root: splitPane(t.root, sessionId, direction, newSessionId), activeSessionId: newSessionId } : t,
        ),
      );
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleClosePane(tabId: number, sessionId: number) {
    await invoke("terminal_close_session", { sessionId });
    setTabs((prev) => {
      const tab = prev.find((t) => t.id === tabId);
      if (!tab) return prev;
      const nextRoot = closePane(tab.root, sessionId);
      if (nextRoot === null) {
        const next = prev.filter((t) => t.id !== tabId);
        if (activeTabId === tabId) setActiveTabId(next.length > 0 ? next[next.length - 1].id : null);
        return next;
      }
      const nextActiveSessionId = tab.activeSessionId === sessionId ? findFirstSessionId(nextRoot) : tab.activeSessionId;
      return prev.map((t) => (t.id === tabId ? { ...t, root: nextRoot, activeSessionId: nextActiveSessionId } : t));
    });
  }

  function handleFocusPane(tabId: number, sessionId: number) {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, activeSessionId: sessionId } : t)));
  }

  function handleRatioChange(tabId: number, splitKey: number, ratio: number) {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, root: setRatio(t.root, splitKey, ratio) } : t)));
  }

  async function handlePickWorkingDirectory() {
    const picked = await open({ directory: true });
    if (!picked || Array.isArray(picked)) return;
    setPendingCwd(picked);
    void setTerminalLastCwd(picked);
  }

  function cycleTab(delta: number) {
    if (tabs.length === 0) return;
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const nextIdx = (idx + delta + tabs.length) % tabs.length;
    setActiveTabId(tabs[nextIdx].id);
  }

  // Ctrl+T new tab, Ctrl+W close the focused pane (or the tab, if it's the
  // last pane), Ctrl+Tab / Ctrl+Shift+Tab cycle tabs — only while this tool
  // is the visible one, since the component stays mounted (hidden) when
  // another tool is selected (see the keep-alive wrapper in App.tsx).
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!active || !e.ctrlKey) return;
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        void handleNewTab();
      } else if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        if (activeTab) void handleClosePane(activeTab.id, activeTab.activeSessionId);
      } else if (e.key === "Tab") {
        e.preventDefault();
        cycleTab(e.shiftKey ? -1 : 1);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, tabs, activeTabId, pendingCwd]);

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background px-6 py-4">
        <div>
          <h1 className="font-heading text-lg font-medium">Terminal</h1>
          <p className="text-sm text-muted-foreground">Native PowerShell terminal with tabs and split panes</p>
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

        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
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
            <div className="flex min-h-0 flex-1 gap-2 overflow-hidden">
              {tabs.length === 0 ? (
                <div className="flex h-full w-full items-center justify-center rounded-lg border text-center text-sm text-muted-foreground">
                  Open a new tab to start a shell
                </div>
              ) : (
                tabs.map((tab) => (
                  <div key={tab.id} className="flex min-h-0 min-w-0 flex-1" style={{ display: tab.id === activeTabId ? "flex" : "none" }}>
                    <PaneTree
                      node={tab.root}
                      visible={tab.id === activeTabId}
                      activeSessionId={tab.activeSessionId}
                      onFocusPane={(sessionId) => handleFocusPane(tab.id, sessionId)}
                      onSplit={(sessionId, direction) => void handleSplit(tab.id, sessionId, direction)}
                      onClose={(sessionId) => void handleClosePane(tab.id, sessionId)}
                      onRatioChange={(splitKey, ratio) => handleRatioChange(tab.id, splitKey, ratio)}
                    />
                  </div>
                ))
              )}
            </div>
            <div className="lg:w-72 lg:shrink-0">
              <QuickCommandsPanel
                namespace="terminal"
                activeSessionId={activeTab?.activeSessionId ?? null}
                onSend={(command) => {
                  if (!activeTab) return;
                  void invoke("terminal_write", { sessionId: activeTab.activeSessionId, data: `${command}\n` });
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
