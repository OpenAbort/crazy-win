import { useState } from "react";
import { Container, Ship, Square, Undo2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/features/dev-environment/confirm-delete-dialog";
import type { KafkaTarget } from "@/features/dev-environment/kafka-store";

export function KafkaLifecycleControls({
  target,
  onStop,
  onReset,
}: {
  target: KafkaTarget;
  onStop: () => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState<"stop" | "reset" | null>(null);

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="gap-1">
        {target === "docker" ? <Container className="size-3" /> : <Ship className="size-3" />}
        {target === "docker" ? "Docker" : "Helm / k8s"}
      </Badge>
      <Button variant="outline" size="sm" onClick={() => setConfirming("stop")}>
        <Square />
        Stop
      </Button>
      <Button variant="outline" size="sm" onClick={() => setConfirming("reset")}>
        <Undo2 />
        Reset
      </Button>

      <ConfirmDeleteDialog
        open={confirming === "stop"}
        onOpenChange={(open) => !open && setConfirming(null)}
        resourceLabel="the Kafka broker"
        actionLabel="Stop"
        onConfirm={onStop}
      />
      <ConfirmDeleteDialog
        open={confirming === "reset"}
        onOpenChange={(open) => !open && setConfirming(null)}
        resourceLabel="the Kafka broker (deletes all topics and messages)"
        actionLabel="Reset"
        onConfirm={onReset}
      />
    </div>
  );
}
