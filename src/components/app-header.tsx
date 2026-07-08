import { Search } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSection, type ToolDef } from "@/lib/tools";

type AppHeaderProps = {
  activeTool: ToolDef;
};

export function AppHeader({ activeTool }: AppHeaderProps) {
  const section = getSection(activeTool.section);

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 !h-4" />

      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="text-muted-foreground">
            <section.icon className="size-3.5" />
            {section.label}
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{activeTool.label}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          className="flex h-8 w-56 items-center gap-2 rounded-lg border border-input bg-muted/40 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Search className="size-4" />
          <span>Search tools...</span>
          <kbd className="ml-auto rounded border bg-background px-1.5 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}
