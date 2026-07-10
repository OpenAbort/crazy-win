import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LoaderCircle, Plus, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ConnectionMode } from "@/features/dev-environment/dev-environment-store";
import { dockerBrokerHost, helmBrokerAddress } from "@/features/dev-environment/kafka-detect-logic";
import type {
  KafkaDockerConfig,
  KafkaHelmConfig,
  KafkaTarget,
} from "@/features/dev-environment/kafka-store";

function EnvRowsEditor({
  rows,
  onChange,
  keyPlaceholder = "KEY",
  valuePlaceholder = "value",
}: {
  rows: [string, string][];
  onChange: (rows: [string, string][]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            value={k}
            onChange={(e) => onChange(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))}
            placeholder={keyPlaceholder}
            className="font-mono text-xs"
          />
          <Input
            value={v}
            onChange={(e) => onChange(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))}
            placeholder={valuePlaceholder}
            className="font-mono text-xs"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            aria-label="Remove row"
          >
            <X />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="self-start" onClick={() => onChange([...rows, ["", ""]])}>
        <Plus />
        Add
      </Button>
    </div>
  );
}

export function KafkaStartPanel({
  target,
  onTargetChange,
  dockerHost,
  dockerMode,
  dockerConfig,
  onDockerConfigChange,
  kubeContexts,
  helmContext,
  onHelmContextChange,
  helmConfig,
  onHelmConfigChange,
  onStarted,
}: {
  target: KafkaTarget;
  onTargetChange: (target: KafkaTarget) => void;
  dockerHost: string;
  dockerMode: ConnectionMode;
  dockerConfig: KafkaDockerConfig;
  onDockerConfigChange: (cfg: KafkaDockerConfig) => void;
  kubeContexts: string[];
  helmContext: string;
  onHelmContextChange: (context: string) => void;
  helmConfig: KafkaHelmConfig;
  onHelmConfigChange: (cfg: KafkaHelmConfig) => void;
  onStarted: (brokers: string, target: KafkaTarget) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /// Freshly-started brokers can take a few seconds to accept connections;
  /// poll the real topics listing rather than guessing a fixed delay.
  async function waitUntilReady(brokers: string, attempts = 30, intervalMs = 2000): Promise<boolean> {
    for (let i = 0; i < attempts; i++) {
      try {
        await invoke("kafka_list_topics", { brokers });
        return true;
      } catch {
        setStatus(`Waiting for broker to become ready... (${i + 1}/${attempts})`);
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }
    return false;
  }

  async function startDocker() {
    setBusy(true);
    setError(null);
    setStatus("Starting container...");
    try {
      await invoke("kafka_docker_start", {
        host: dockerHost,
        containerName: dockerConfig.containerName,
        image: dockerConfig.image,
        port: dockerConfig.port,
        extraEnv: dockerConfig.extraEnv,
        mode: dockerMode,
      });
      const brokers = `${dockerBrokerHost(dockerHost)}:${dockerConfig.port}`;
      if (await waitUntilReady(brokers)) {
        onStarted(brokers, "docker");
      } else {
        setError("Broker didn't become ready in time. It may still be starting — try refreshing shortly.");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  async function startHelm() {
    setBusy(true);
    setError(null);
    setStatus("Installing chart...");
    try {
      await invoke("kafka_helm_start", {
        context: helmContext,
        namespace: helmConfig.namespace,
        release: helmConfig.release,
        chart: helmConfig.chart,
        values: helmConfig.valuesOverrides,
      });
      const brokers = helmBrokerAddress(helmConfig.release, helmConfig.namespace);
      if (await waitUntilReady(brokers)) {
        onStarted(brokers, "helm");
      } else {
        setError("Broker didn't become ready in time. It may still be starting — try refreshing shortly.");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-4 rounded-lg border p-4">
      <div>
        <h2 className="font-medium">No Kafka broker detected</h2>
        <p className="text-sm text-muted-foreground">
          Start one with the defaults below, or edit the config first.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to start</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={target} onValueChange={(v) => onTargetChange(v as KafkaTarget)}>
        <TabsList>
          <TabsTrigger value="docker">Docker</TabsTrigger>
          <TabsTrigger value="helm">Helm / k8s</TabsTrigger>
        </TabsList>

        <TabsContent value="docker" className="flex flex-col gap-3 pt-2">
          <p className="text-xs text-muted-foreground">
            Runs a single-node KRaft-mode broker against the Docker host configured in the Docker
            Manager tool (<code>{dockerHost.trim() || "local socket"}</code>), via{" "}
            {dockerMode === "api" ? "the Docker Engine API (no docker.exe needed)" : <code>docker.exe</code>} — matching
            Docker Manager's own CLI/API mode setting.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label>Container name</Label>
            <Input
              value={dockerConfig.containerName}
              onChange={(e) => onDockerConfigChange({ ...dockerConfig, containerName: e.target.value })}
              className="font-mono text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Image</Label>
            <Input
              value={dockerConfig.image}
              onChange={(e) => onDockerConfigChange({ ...dockerConfig, image: e.target.value })}
              className="font-mono text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Port</Label>
            <Input
              value={dockerConfig.port}
              onChange={(e) =>
                onDockerConfigChange({ ...dockerConfig, port: Number(e.target.value) || dockerConfig.port })
              }
              inputMode="numeric"
              className="w-28 font-mono text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Extra environment variables</Label>
            <EnvRowsEditor
              rows={dockerConfig.extraEnv}
              onChange={(rows) => onDockerConfigChange({ ...dockerConfig, extraEnv: rows })}
            />
          </div>
          <Button onClick={() => void startDocker()} disabled={busy} className="self-start">
            {busy && <LoaderCircle className="animate-spin" />}
            Start Kafka (Docker)
          </Button>
          {busy && status && <p className="text-xs text-muted-foreground">{status}</p>}
        </TabsContent>

        <TabsContent value="helm" className="flex flex-col gap-3 pt-2">
          <p className="text-xs text-muted-foreground">
            Installs a Kafka Helm chart into the selected k8s context. Bootstrap address resolution
            assumes the Bitnami chart's default service naming.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label>Context</Label>
            <Select value={helmContext} onValueChange={onHelmContextChange}>
              <SelectTrigger>
                <SelectValue placeholder="Context" />
              </SelectTrigger>
              <SelectContent>
                {kubeContexts.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Namespace</Label>
            <Input
              value={helmConfig.namespace}
              onChange={(e) => onHelmConfigChange({ ...helmConfig, namespace: e.target.value })}
              className="font-mono text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Release name</Label>
            <Input
              value={helmConfig.release}
              onChange={(e) => onHelmConfigChange({ ...helmConfig, release: e.target.value })}
              className="font-mono text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Chart</Label>
            <Input
              value={helmConfig.chart}
              onChange={(e) => onHelmConfigChange({ ...helmConfig, chart: e.target.value })}
              className="font-mono text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Values overrides (--set)</Label>
            <EnvRowsEditor
              rows={helmConfig.valuesOverrides}
              onChange={(rows) => onHelmConfigChange({ ...helmConfig, valuesOverrides: rows })}
              keyPlaceholder="key.path"
            />
          </div>
          <Button onClick={() => void startHelm()} disabled={busy || !helmContext} className="self-start">
            {busy && <LoaderCircle className="animate-spin" />}
            Start Kafka (Helm)
          </Button>
          {busy && status && <p className="text-xs text-muted-foreground">{status}</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
