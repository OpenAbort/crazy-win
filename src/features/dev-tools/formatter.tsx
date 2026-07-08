import { Braces } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";

export function Formatter() {
  return (
    <ComingSoon
      icon={Braces}
      title="Formatter"
      description="Pretty-print and minify JSON, XML, SQL and more with a paste-in, copy-out workflow."
    />
  );
}
