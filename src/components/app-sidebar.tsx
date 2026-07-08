import { Terminal } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { sections, toolsBySection, type ToolId } from "@/lib/tools";

type AppSidebarProps = {
  activeId: ToolId;
  onSelect: (id: ToolId) => void;
};

export function AppSidebar({ activeId, onSelect }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="group-data-[collapsible=icon]:!p-0"
              tooltip="DevBox"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Terminal className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-heading font-medium">DevBox</span>
                <span className="text-xs text-muted-foreground">
                  All-in-one dev tools
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.id}>
            <SidebarGroupLabel>
              <section.icon className="mr-2 size-3.5" />
              {section.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {toolsBySection(section.id).map((tool) => (
                  <SidebarMenuItem key={tool.id}>
                    <SidebarMenuButton
                      isActive={tool.id === activeId}
                      tooltip={tool.label}
                      onClick={() => onSelect(tool.id)}
                    >
                      <tool.icon />
                      <span>{tool.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <div className="px-2 py-1.5 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          v0.1.0
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
