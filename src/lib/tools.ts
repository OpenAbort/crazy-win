import { lazy, type ComponentType } from "react";
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
  Waypoints,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const HostsEditor = lazy(() =>
  import("@/features/window-manager/hosts-editor").then((m) => ({ default: m.HostsEditor })),
);
const EnvEditor = lazy(() =>
  import("@/features/window-manager/env-editor").then((m) => ({ default: m.EnvEditor })),
);
const Formatter = lazy(() =>
  import("@/features/dev-tools/formatter").then((m) => ({ default: m.Formatter })),
);
const TextComparer = lazy(() =>
  import("@/features/dev-tools/text-comparer").then((m) => ({ default: m.TextComparer })),
);
const MarkdownViewer = lazy(() =>
  import("@/features/dev-tools/markdown-viewer").then((m) => ({ default: m.MarkdownViewer })),
);
const HelmFormatter = lazy(() =>
  import("@/features/dev-tools/helm-formatter").then((m) => ({ default: m.HelmFormatter })),
);
const DockerManager = lazy(() =>
  import("@/features/dev-environment/docker-manager").then((m) => ({ default: m.DockerManager })),
);
const KubernetesManager = lazy(() =>
  import("@/features/dev-environment/kubernetes-manager").then((m) => ({
    default: m.KubernetesManager,
  })),
);
const HelmReleases = lazy(() =>
  import("@/features/dev-environment/helm-releases").then((m) => ({ default: m.HelmReleases })),
);
const KafkaManager = lazy(() =>
  import("@/features/dev-environment/kafka-manager").then((m) => ({ default: m.KafkaManager })),
);

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
  | "helm-releases"
  | "kafka-manager";

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
  {
    id: "kafka-manager",
    label: "Kafka",
    description: "Browse topics, tail messages, produce, and manage a Kafka broker",
    icon: Waypoints,
    section: "dev-environment",
    Component: KafkaManager,
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
