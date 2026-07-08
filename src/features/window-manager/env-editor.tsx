import { Settings2 } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";

export function EnvEditor() {
  return (
    <ComingSoon
      icon={Settings2}
      title="Env Editor"
      description="Manage user and system environment variables in one place, with edit and cleanup helpers."
    />
  );
}
