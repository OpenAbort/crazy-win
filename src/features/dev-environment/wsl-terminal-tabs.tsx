import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export interface WslTab {
  id: number;
  label: string;
}

export function WslTerminalTabs({
  tabs,
  activeTabId,
  onSelect,
  onClose,
}: {
  tabs: WslTab[];
  activeTabId: number | null;
  onSelect: (id: number) => void;
  onClose: (id: number) => void;
}) {
  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-muted p-[3px]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          className={cn(
            "group flex shrink-0 items-center gap-1.5 rounded-md border border-transparent px-2.5 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground",
            tab.id === activeTabId && "bg-background text-foreground shadow-sm dark:bg-input/30",
          )}
        >
          <span>{tab.label}</span>
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onClose(tab.id);
            }}
            className="rounded-sm p-0.5 opacity-60 hover:bg-foreground/10 hover:opacity-100"
            aria-label="Close tab"
          >
            <X className="size-3" />
          </span>
        </button>
      ))}
    </div>
  );
}
