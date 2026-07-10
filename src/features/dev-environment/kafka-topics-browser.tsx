import { useMemo, useState } from "react";
import { Eraser, Plus, RefreshCw, Search, Trash2, Waypoints } from "lucide-react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDeleteDialog } from "@/features/dev-environment/confirm-delete-dialog";
import {
  filterTopics,
  type KafkaBrokerSummary,
  type KafkaTopicSummary,
} from "@/features/dev-environment/kafka-manager-logic";

export function KafkaTopicsBrowser({
  topics,
  selectedTopic,
  onSelectTopic,
  onRefresh,
  loading,
  onCreateTopic,
  onDeleteTopic,
  onPurgeTopic,
}: {
  topics: KafkaTopicSummary[];
  selectedTopic: string | null;
  onSelectTopic: (name: string) => void;
  onRefresh: () => void;
  loading: boolean;
  onCreateTopic: (name: string, partitions: number, replicationFactor: number) => Promise<void>;
  onDeleteTopic: (name: string) => Promise<void>;
  onPurgeTopic: (name: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => filterTopics(topics, query), [topics, query]);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPartitions, setNewPartitions] = useState("1");
  const [newReplication, setNewReplication] = useState("1");
  const [createBusy, setCreateBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<string | null>(null);

  async function handleCreate() {
    setCreateBusy(true);
    try {
      await onCreateTopic(newName, Number(newPartitions) || 1, Number(newReplication) || 1);
      setCreating(false);
      setNewName("");
      setNewPartitions("1");
      setNewReplication("1");
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter topics..."
            className="pl-8"
          />
        </div>
        <Button variant="outline" onClick={() => setCreating(true)}>
          <Plus />
          New topic
        </Button>
        <Button variant="outline" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
        <div className="divide-y">
          {filtered.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground">
              <Waypoints className="size-6" />
              No topics found.
            </div>
          )}
          {filtered.map((t) => (
            <button
              key={t.name}
              onClick={() => onSelectTopic(t.name)}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 ${
                selectedTopic === t.name ? "bg-muted" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-sm">{t.name}</div>
              </div>
              <Badge variant="outline">{t.partition_count} partitions</Badge>
              <Badge variant="outline" title="Replication factor isn't exposed by the Kafka client library used here.">
                — RF
              </Badge>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setPurgeTarget(t.name);
                }}
                aria-label="Purge topic"
                title="Purge all messages"
              >
                <Eraser />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(t.name);
                }}
                aria-label="Delete topic"
              >
                <Trash2 />
              </Button>
            </button>
          ))}
        </div>
      </div>

      <AlertDialog open={creating} onOpenChange={setCreating}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>New topic</AlertDialogTitle>
            <AlertDialogDescription>Creates a topic on the connected broker.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="font-mono text-sm" />
            </div>
            <div className="flex gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label>Partitions</Label>
                <Input value={newPartitions} onChange={(e) => setNewPartitions(e.target.value)} inputMode="numeric" />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label>Replication factor</Label>
                <Input
                  value={newReplication}
                  onChange={(e) => setNewReplication(e.target.value)}
                  inputMode="numeric"
                />
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)} disabled={createBusy}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} disabled={createBusy || !newName.trim()}>
              {createBusy ? "Creating..." : "Create"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        resourceLabel={deleteTarget ?? ""}
        actionLabel="Delete"
        onConfirm={async () => {
          if (deleteTarget) await onDeleteTopic(deleteTarget);
        }}
      />
      <ConfirmDeleteDialog
        open={!!purgeTarget}
        onOpenChange={(open) => !open && setPurgeTarget(null)}
        resourceLabel={`all messages in "${purgeTarget ?? ""}"`}
        actionLabel="Purge"
        onConfirm={async () => {
          if (purgeTarget) await onPurgeTopic(purgeTarget);
        }}
      />
    </div>
  );
}

export function KafkaBrokersPanel({ brokerList }: { brokerList: KafkaBrokerSummary[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <p className="text-xs text-muted-foreground">
        These are the configured bootstrap servers, not a live cluster-wide broker roster.
      </p>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto rounded-lg border p-2">
        {brokerList.length === 0 && <p className="text-sm text-muted-foreground">No brokers configured.</p>}
        {brokerList.map((b) => (
          <div key={`${b.host}:${b.port}`} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5">
            <Badge variant="default">bootstrap</Badge>
            <span className="font-mono text-sm">
              {b.host}:{b.port}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
