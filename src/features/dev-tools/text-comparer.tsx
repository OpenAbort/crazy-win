import { GitCompareArrows } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";

export function TextComparer() {
  return (
    <ComingSoon
      icon={GitCompareArrows}
      title="Text Comparer"
      description="Diff two blocks of text side by side with line- and character-level highlighting."
    />
  );
}
