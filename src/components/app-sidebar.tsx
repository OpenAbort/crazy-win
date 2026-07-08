import {Fragment} from "react";
import {ChevronRight, Terminal} from "lucide-react";

import {Collapsible, CollapsibleContent, CollapsibleTrigger,} from "@/components/ui/collapsible";
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
import {sections, type ToolId, toolsBySection} from "@/lib/tools";
import {Separator} from "@/components/ui/separator";

type AppSidebarProps = {
  activeId: ToolId;
  onSelect: (id: ToolId) => void;
};

export function AppSidebar({activeId, onSelect}: AppSidebarProps) {
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
              <div
                className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Terminal className="size-4"/>
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
          <Fragment key={section.id}>
            <Collapsible
              defaultOpen
              className="group/collapsible"
            >
              <SidebarGroup>
                <SidebarGroupLabel asChild>
                  <CollapsibleTrigger className="flex w-full items-center">
                    <section.icon className="mr-2 size-3.5"/>
                    {section.label}
                    <ChevronRight
                      className="ml-auto size-3.5 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"/>
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {toolsBySection(section.id).map((tool) => (
                        <SidebarMenuItem key={tool.id}>
                          <SidebarMenuButton
                            isActive={tool.id === activeId}
                            tooltip={tool.label}
                            onClick={() => onSelect(tool.id)}
                          >
                            <tool.icon/>
                            <span>{tool.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
            <Separator/>
          </Fragment>
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
