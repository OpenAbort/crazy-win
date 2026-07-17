import { lazy, Suspense, useEffect, useState } from "react";

import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getTool, tools, type ToolId } from "@/lib/tools";
import "./App.css";

const WslTerminal = getTool("wsl-terminal").Component;
// Imported directly (not via `getTool("terminal").Component`) because it
// needs the `active` prop, which the registry's `ComponentType` erases.
const Terminal = lazy(() =>
  import("@/features/dev-environment/terminal").then((m) => ({ default: m.Terminal })),
);

function App() {
  const [activeId, setActiveId] = useState<ToolId>(tools[0].id);
  const activeTool = getTool(activeId);
  const ActiveComponent = activeTool.Component;
  const isWsl = activeId === "wsl-terminal";
  const isTerminal = activeId === "terminal";

  // WSL Terminal and Terminal both hold live backend PTY sessions and
  // xterm.js scrollback that can't be reconstructed on remount — keep them
  // mounted (hidden via CSS) instead of unmounting like every other tool,
  // once the user first visits each. Every other tool's state is trivially
  // refetchable, so they don't need this treatment.
  const [wslVisited, setWslVisited] = useState(false);
  useEffect(() => {
    if (isWsl) setWslVisited(true);
  }, [isWsl]);

  const [terminalVisited, setTerminalVisited] = useState(false);
  useEffect(() => {
    if (isTerminal) setTerminalVisited(true);
  }, [isTerminal]);

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AppSidebar activeId={activeId} onSelect={setActiveId} />
      <SidebarInset className="min-h-0">
        <AppHeader activeTool={activeTool} />
        <main className="flex min-h-0 flex-1 flex-col overflow-auto">
          <Suspense fallback={null}>{!isWsl && !isTerminal && <ActiveComponent />}</Suspense>
          {wslVisited && (
            <div style={{ display: isWsl ? "contents" : "none" }}>
              <Suspense fallback={null}>
                <WslTerminal />
              </Suspense>
            </div>
          )}
          {terminalVisited && (
            <div style={{ display: isTerminal ? "contents" : "none" }}>
              <Suspense fallback={null}>
                <Terminal active={isTerminal} />
              </Suspense>
            </div>
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default App;
