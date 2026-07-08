import { FileText } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";

export function MarkdownViewer() {
  return (
    <ComingSoon
      icon={FileText}
      title="Markdown Viewer"
      description="Write Markdown on the left and preview the rendered output live on the right."
    />
  );
}
