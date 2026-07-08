import { Network } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";

export function HostsEditor() {
  return (
    <ComingSoon
      icon={Network}
      title="Hosts File Editor"
      description="View and edit your system hosts file with quick enable/disable toggles for each entry."
    />
  );
}
