import { useState, type MouseEvent } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  resourceLabel,
  actionLabel = "Delete",
  showForce = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceLabel: string;
  actionLabel?: string;
  showForce?: boolean;
  onConfirm: (force: boolean) => void | Promise<void>;
}) {
  const [force, setForce] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleConfirm(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    setPending(true);
    try {
      await onConfirm(force);
      onOpenChange(false);
    } finally {
      setPending(false);
      setForce(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {actionLabel} "{resourceLabel}"?
          </AlertDialogTitle>
          <AlertDialogDescription>This action can't be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        {showForce && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={force} onCheckedChange={setForce} />
            Force (remove even if running)
          </label>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={handleConfirm}>
            {pending ? "Working..." : actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
