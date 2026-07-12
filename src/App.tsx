import { Suspense, useEffect, useState } from "react";

import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getTool, tools, type ToolId } from "@/lib/tools";
import "./App.css";

const WslTerminal = getTool("wsl-terminal").Component;

function App() {
  const [activeId, setActiveId] = useState<ToolId>(tools[0].id);
  const activeTool = getTool(activeId);
  const ActiveComponent = activeTool.Component;
  const isWsl = activeId === "wsl-terminal";

  // WSL Terminal holds live backend PTY sessions and xterm.js scrollback that
  // can't be reconstructed on remount — keep it mounted (hidden via CSS)
  // instead of unmounting it like every other tool, once the user first
  // visits it. Every other tool's state is trivially refetchable, so they
  // don't need this treatment.
  const [wslVisited, setWslVisited] = useState(false);
  useEffect(() => {
    if (isWsl) setWslVisited(true);
  }, [isWsl]);

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AppSidebar activeId={activeId} onSelect={setActiveId} />
      <SidebarInset className="min-h-0">
        <AppHeader activeTool={activeTool} />
        <main className="flex min-h-0 flex-1 flex-col overflow-auto">
          <Suspense fallback={null}>{!isWsl && <ActiveComponent />}</Suspense>
          {wslVisited && (
            <div style={{ display: isWsl ? "contents" : "none" }}>
              <Suspense fallback={null}>
                <WslTerminal />
              </Suspense>
            </div>
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default App;
