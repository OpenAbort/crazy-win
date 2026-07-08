import { useState } from "react";

import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getTool, tools, type ToolId } from "@/lib/tools";
import "./App.css";

function App() {
  const [activeId, setActiveId] = useState<ToolId>(tools[0].id);
  const activeTool = getTool(activeId);
  const ActiveComponent = activeTool.Component;

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AppSidebar activeId={activeId} onSelect={setActiveId} />
      <SidebarInset className="min-h-0">
        <AppHeader activeTool={activeTool} />
        <main className="flex min-h-0 flex-1 flex-col overflow-auto">
          <ActiveComponent />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default App;
