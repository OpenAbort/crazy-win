import { lazy, type ComponentType } from "react";
import {
  Anchor,
  AppWindow,
  Binary,
  Boxes,
  Braces,
  CaseSensitive,
  Clock,
  Container,
  Dices,
  FileJson2,
  FileText,
  GitCompareArrows,
  Globe,
  Hash,
  KeyRound,
  Layers,
  Link,
  Network,
  Regex,
  Settings2,
  Ship,
  SquareTerminal,
  TerminalSquare,
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
const Base64Encoder = lazy(() =>
  import("@/features/dev-tools/base64-encoder").then((m) => ({ default: m.Base64Encoder })),
);
const UrlEncoder = lazy(() =>
  import("@/features/dev-tools/url-encoder").then((m) => ({ default: m.UrlEncoder })),
);
const CaseConverter = lazy(() =>
  import("@/features/dev-tools/case-converter").then((m) => ({ default: m.CaseConverter })),
);
const JsonYamlConverter = lazy(() =>
  import("@/features/dev-tools/json-yaml-converter").then((m) => ({ default: m.JsonYamlConverter })),
);
const JwtDecoder = lazy(() =>
  import("@/features/dev-tools/jwt-decoder").then((m) => ({ default: m.JwtDecoder })),
);
const HashGenerator = lazy(() =>
  import("@/features/dev-tools/hash-generator").then((m) => ({ default: m.HashGenerator })),
);
const TimestampConverter = lazy(() =>
  import("@/features/dev-tools/timestamp-converter").then((m) => ({ default: m.TimestampConverter })),
);
const RegexTester = lazy(() =>
  import("@/features/dev-tools/regex-tester").then((m) => ({ default: m.RegexTester })),
);
const UuidGenerator = lazy(() =>
  import("@/features/dev-tools/uuid-generator").then((m) => ({ default: m.UuidGenerator })),
);
const HttpClientTool = lazy(() =>
  import("@/features/dev-environment/http-client").then((m) => ({ default: m.HttpClientTool })),
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
const WslTerminal = lazy(() =>
  import("@/features/dev-environment/wsl-terminal").then((m) => ({ default: m.WslTerminal })),
);
const Terminal = lazy(() =>
  import("@/features/dev-environment/terminal").then((m) => ({ default: m.Terminal })),
);

export type SectionId = "window-manager" | "dev-tools" | "dev-environment";

export type ToolId =
  | "hosts-editor"
  | "env-editor"
  | "formatter"
  | "text-comparer"
  | "markdown-viewer"
  | "helm-formatter"
  | "base64-encoder"
  | "url-encoder"
  | "case-converter"
  | "json-yaml-converter"
  | "jwt-decoder"
  | "hash-generator"
  | "timestamp-converter"
  | "regex-tester"
  | "uuid-generator"
  | "docker-manager"
  | "kubernetes-manager"
  | "helm-releases"
  | "kafka-manager"
  | "wsl-terminal"
  | "terminal"
  | "http-client";

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
  /// Tools with no Linux/macOS equivalent (WSL, the Windows registry). Hidden
  /// from the sidebar once the platform is known and isn't "windows".
  windowsOnly?: boolean;
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
    windowsOnly: true,
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
    id: "base64-encoder",
    label: "Base64 Encoder",
    description: "Encode and decode Base64 text",
    icon: Binary,
    section: "dev-tools",
    Component: Base64Encoder,
  },
  {
    id: "url-encoder",
    label: "URL Encoder",
    description: "Encode, decode, and parse URLs and query strings",
    icon: Link,
    section: "dev-tools",
    Component: UrlEncoder,
  },
  {
    id: "case-converter",
    label: "Case Converter",
    description: "Convert text between camelCase, snake_case, kebab-case, and more",
    icon: CaseSensitive,
    section: "dev-tools",
    Component: CaseConverter,
  },
  {
    id: "json-yaml-converter",
    label: "JSON ↔ YAML",
    description: "Convert between JSON and YAML",
    icon: FileJson2,
    section: "dev-tools",
    Component: JsonYamlConverter,
  },
  {
    id: "jwt-decoder",
    label: "JWT Decoder",
    description: "Decode a JSON Web Token's header, payload, and expiry",
    icon: KeyRound,
    section: "dev-tools",
    Component: JwtDecoder,
  },
  {
    id: "hash-generator",
    label: "Hash Generator",
    description: "Compute MD5, SHA-1, SHA-256, SHA-384, and SHA-512 hashes",
    icon: Hash,
    section: "dev-tools",
    Component: HashGenerator,
  },
  {
    id: "timestamp-converter",
    label: "Timestamp Converter",
    description: "Convert between Unix epoch and human-readable dates",
    icon: Clock,
    section: "dev-tools",
    Component: TimestampConverter,
  },
  {
    id: "regex-tester",
    label: "Regex Tester",
    description: "Test a regular expression against sample text",
    icon: Regex,
    section: "dev-tools",
    Component: RegexTester,
  },
  {
    id: "uuid-generator",
    label: "UUID Generator",
    description: "Generate UUIDs or random strings",
    icon: Dices,
    section: "dev-tools",
    Component: UuidGenerator,
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
  {
    id: "wsl-terminal",
    label: "WSL Terminal",
    description: "Interactive WSL shell with tabs, quick commands, and working-directory launch",
    icon: SquareTerminal,
    section: "dev-environment",
    Component: WslTerminal,
    windowsOnly: true,
  },
  {
    id: "terminal",
    label: "Terminal",
    description: "Native terminal (PowerShell or your default shell) with tabs and split panes",
    icon: TerminalSquare,
    section: "dev-environment",
    Component: Terminal,
  },
  {
    id: "http-client",
    label: "HTTP Client",
    description: "Build and send arbitrary HTTP requests",
    icon: Globe,
    section: "dev-environment",
    Component: HttpClientTool,
  },
];

export function toolsBySection(sectionId: SectionId, platform: string | null): ToolDef[] {
  return tools.filter(
    (tool) => tool.section === sectionId && (!tool.windowsOnly || platform === null || platform === "windows"),
  );
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
