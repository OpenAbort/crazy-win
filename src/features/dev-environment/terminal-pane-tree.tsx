import { useRef } from "react";
import { Columns2, Rows2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TerminalPane } from "@/features/dev-environment/terminal-pane";
import { findFirstSessionId, type PaneNode, type SplitDirection } from "@/features/dev-environment/terminal-panes-logic";

function PaneDivider({ direction, onDrag }: { direction: SplitDirection; onDrag: (deltaRatio: number) => void }) {
  const draggingRef = useRef(false);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    const container = target.parentElement;

    function handleMove(moveEvent: PointerEvent) {
      if (!draggingRef.current || !container) return;
      const rect = container.getBoundingClientRect();
      const ratio =
        direction === "row"
          ? (moveEvent.clientX - rect.left) / rect.width
          : (moveEvent.clientY - rect.top) / rect.height;
      onDrag(ratio);
    }
    function handleUp() {
      draggingRef.current = false;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      className={
        direction === "row"
          ? "w-1.5 shrink-0 cursor-col-resize rounded-full bg-border hover:bg-muted-foreground/40"
          : "h-1.5 shrink-0 cursor-row-resize rounded-full bg-border hover:bg-muted-foreground/40"
      }
    />
  );
}

function PaneHeader({
  onSplitRow,
  onSplitColumn,
  onClose,
}: {
  onSplitRow: () => void;
  onSplitColumn: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-0.5 border-b bg-muted/30 px-1 py-0.5">
      <Button variant="ghost" size="icon-sm" onClick={onSplitRow} aria-label="Split vertically">
        <Columns2 className="size-3.5" />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={onSplitColumn} aria-label="Split horizontally">
        <Rows2 className="size-3.5" />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close pane">
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

export function PaneTree({
  node,
  visible,
  activeSessionId,
  onFocusPane,
  onSplit,
  onClose,
  onRatioChange,
}: {
  node: PaneNode;
  visible: boolean;
  activeSessionId: number;
  onFocusPane: (sessionId: number) => void;
  onSplit: (sessionId: number, direction: SplitDirection) => void;
  onClose: (sessionId: number) => void;
  onRatioChange: (splitKey: number, ratio: number) => void;
}) {
  if (node.type === "leaf") {
    return (
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border ${
          node.sessionId === activeSessionId ? "border-primary/50" : ""
        }`}
        onClick={() => onFocusPane(node.sessionId)}
      >
        <PaneHeader
          onSplitRow={() => onSplit(node.sessionId, "row")}
          onSplitColumn={() => onSplit(node.sessionId, "column")}
          onClose={() => onClose(node.sessionId)}
        />
        <div className="min-h-0 flex-1">
          <TerminalPane sessionId={node.sessionId} active={visible} />
        </div>
      </div>
    );
  }

  const splitKey = findFirstSessionId(node);
  return (
    <div className={`flex min-h-0 min-w-0 flex-1 ${node.direction === "row" ? "flex-row" : "flex-col"}`}>
      <div className="flex min-h-0 min-w-0" style={{ flexBasis: `${node.ratio * 100}%`, flexGrow: 0, flexShrink: 0 }}>
        <PaneTree
          node={node.a}
          visible={visible}
          activeSessionId={activeSessionId}
          onFocusPane={onFocusPane}
          onSplit={onSplit}
          onClose={onClose}
          onRatioChange={onRatioChange}
        />
      </div>
      <PaneDivider direction={node.direction} onDrag={(ratio) => onRatioChange(splitKey, ratio)} />
      <div className="flex min-h-0 min-w-0 flex-1">
        <PaneTree
          node={node.b}
          visible={visible}
          activeSessionId={activeSessionId}
          onFocusPane={onFocusPane}
          onSplit={onSplit}
          onClose={onClose}
          onRatioChange={onRatioChange}
        />
      </div>
    </div>
  );
}
