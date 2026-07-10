import type { ComponentType } from "react";
import {
  Anchor,
  AppWindow,
  Boxes,
  Braces,
  Container,
  FileText,
  GitCompareArrows,
  Layers,
  Network,
  Settings2,
  Ship,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { HostsEditor } from "@/features/window-manager/hosts-editor";
import { EnvEditor } from "@/features/window-manager/env-editor";
import { Formatter } from "@/features/dev-tools/formatter";
import { TextComparer } from "@/features/dev-tools/text-comparer";
import { MarkdownViewer } from "@/features/dev-tools/markdown-viewer";
import { HelmFormatter } from "@/features/dev-tools/helm-formatter";
import { DockerManager } from "@/features/dev-environment/docker-manager";
import { KubernetesManager } from "@/features/dev-environment/kubernetes-manager";
import { HelmReleases } from "@/features/dev-environment/helm-releases";

export type SectionId = "window-manager" | "dev-tools" | "dev-environment";

export type ToolId =
  | "hosts-editor"
  | "env-editor"
  | "formatter"
  | "text-comparer"
  | "markdown-viewer"
  | "helm-formatter"
  | "docker-manager"
  | "kubernetes-manager"
  | "helm-releases";

export interface SectionDef {
  id: SectionId;
  label: string;
  icon: LucideIcon;
}

export interface ToolDef {
  id: ToolId;
  label: string;
  description: string;
  icon: LucideIcon;
  section: SectionId;
  Component: ComponentType;
}

export const sections: SectionDef[] = [
  { id: "window-manager", label: "Window Manager", icon: AppWindow },
  { id: "dev-tools", label: "Dev Tools", icon: Wrench },
  { id: "dev-environment", label: "Dev Environment", icon: Layers },
];

export const tools: ToolDef[] = [
  {
    id: "hosts-editor",
    label: "Hosts File Editor",
    description: "Edit the system hosts file",
    icon: Network,
    section: "window-manager",
    Component: HostsEditor,
  },
  {
    id: "env-editor",
    label: "Env Editor",
    description: "Manage environment variables",
    icon: Settings2,
    section: "window-manager",
    Component: EnvEditor,
  },
  {
    id: "formatter",
    label: "Formatter",
    description: "Format and minify code",
    icon: Braces,
    section: "dev-tools",
    Component: Formatter,
  },
  {
    id: "text-comparer",
    label: "Text Comparer",
    description: "Diff two blocks of text",
    icon: GitCompareArrows,
    section: "dev-tools",
    Component: TextComparer,
  },
  {
    id: "markdown-viewer",
    label: "Markdown Viewer",
    description: "Preview Markdown live",
    icon: FileText,
    section: "dev-tools",
    Component: MarkdownViewer,
  },
  {
    id: "helm-formatter",
    label: "Helm Formatter",
    description: "Tidy multi-line helm commands and edit --set values",
    icon: Ship,
    section: "dev-tools",
    Component: HelmFormatter,
  },
  {
    id: "docker-manager",
    label: "Docker",
    description: "Browse, inspect, and remove Docker containers",
    icon: Container,
    section: "dev-environment",
    Component: DockerManager,
  },
  {
    id: "kubernetes-manager",
    label: "Kubernetes",
    description: "Browse and manage pods, deployments, and services",
    icon: Boxes,
    section: "dev-environment",
    Component: KubernetesManager,
  },
  {
    id: "helm-releases",
    label: "Helm",
    description: "View and manage installed Helm releases",
    icon: Anchor,
    section: "dev-environment",
    Component: HelmReleases,
  },
];

export function toolsBySection(sectionId: SectionId): ToolDef[] {
  return tools.filter((tool) => tool.section === sectionId);
}

export function getTool(id: ToolId): ToolDef {
  const tool = tools.find((t) => t.id === id);
  if (!tool) {
    throw new Error(`Unknown tool: ${id}`);
  }
  return tool;
}

export function getSection(id: SectionId): SectionDef {
  const section = sections.find((s) => s.id === id);
  if (!section) {
    throw new Error(`Unknown section: ${id}`);
  }
  return section;
}
