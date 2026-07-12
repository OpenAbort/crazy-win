import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LoaderCircle, TriangleAlert, Waypoints } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseContainerList } from "@/features/dev-environment/docker-manager-logic";
import { getDockerHost, getDockerMode, type ConnectionMode } from "@/features/dev-environment/dev-environment-store";
import { parseReleaseList } from "@/features/dev-environment/helm-releases-logic";
import { detectDockerKafka, detectHelmKafka } from "@/features/dev-environment/kafka-detect-logic";
import { KafkaLifecycleControls } from "@/features/dev-environment/kafka-lifecycle-controls";
import { parseBrokerList, parseTopicList } from "@/features/dev-environment/kafka-manager-logic";
import { KafkaMessageViewer } from "@/features/dev-environment/kafka-message-viewer";
import { KafkaProduceForm } from "@/features/dev-environment/kafka-produce-form";
import { KafkaStartPanel } from "@/features/dev-environment/kafka-start-panel";
import { KafkaBrokersPanel, KafkaTopicsBrowser } from "@/features/dev-environment/kafka-topics-browser";
import {
  getKafkaBrokers,
  getKafkaDockerConfig,
  getKafkaHelmConfig,
  getKafkaTarget,
  setKafkaBrokers,
  setKafkaDockerConfig,
  setKafkaHelmConfig,
  setKafkaTarget,
  type KafkaDockerConfig,
  type KafkaHelmConfig,
  type KafkaTarget,
} from "@/features/dev-environment/kafka-store";
import { parseContextNames } from "@/features/dev-environment/kubernetes-manager-logic";
import type { KafkaBrokerSummary, KafkaTopicSummary } from "@/features/dev-environment/kafka-manager-logic";

type Phase = "start" | "connected";

export function KafkaManager() {
  // Optimistic default: assume no broker yet rather than blocking on a
  // full-screen spinner while the store loads and detection runs.
  const [phase, setPhase] = useState<Phase>("start");
  const [error, setError] = useState<string | null>(null);

  const [dockerHost, setDockerHost] = useState("");
  const [dockerMode, setDockerMode] = useState<ConnectionMode>("cli");
  const [target, setTarget] = useState<KafkaTarget>("docker");
  const [dockerConfig, setDockerConfig] = useState<KafkaDockerConfig>({
    containerName: "devbox-kafka",
    image: "apache/kafka:3.9.0",
    port: 9092,
    extraEnv: [],
  });
  const [helmConfig, setHelmConfig] = useState<KafkaHelmConfig>({
    namespace: "kafka",
    release: "devbox-kafka",
    chart: "oci://registry-1.docker.io/bitnamicharts/kafka",
    valuesOverrides: [],
  });
  const [kubeContexts, setKubeContexts] = useState<string[]>([]);
  const [helmContext, setHelmContext] = useState("");
  const [brokers, setBrokers] = useState("");

  const [topics, setTopics] = useState<KafkaTopicSummary[]>([]);
  const [brokerList, setBrokerList] = useState<KafkaBrokerSummary[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [topicsLoading, setTopicsLoading] = useState(false);
  /// True while a background Docker/kubectl/Helm scan is reconciling the
  /// optimistic UI guess — never blocks interaction, just annotates it.
  const [checking, setChecking] = useState(false);

  const selectedTopicObj = useMemo(
    () => topics.find((t) => t.name === selectedTopic) ?? null,
    [topics, selectedTopic],
  );

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    if (phase === "connected" && brokers) void refreshTopics();
  }, [phase, brokers]);

  async function refreshTopics() {
    setTopicsLoading(true);
    setError(null);
    try {
      const [rawTopics, rawBrokers] = await Promise.all([
        invoke<string>("kafka_list_topics", { brokers }),
        invoke<string>("kafka_list_brokers", { brokers }),
      ]);
      setTopics(parseTopicList(rawTopics));
      setBrokerList(parseBrokerList(rawBrokers));
    } catch (e) {
      setError(String(e));
    } finally {
      setTopicsLoading(false);
    }
  }

  /// Single fast RPC, bounded by a short timeout — used to check whether a
  /// previously-known broker is still reachable before falling back to a full
  /// Docker/kubectl/Helm scan.
  async function pingBrokers(brokersToCheck: string, timeoutMs = 1500): Promise<boolean> {
    try {
      await Promise.race([
        invoke("kafka_list_topics", { brokers: brokersToCheck }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  async function loadKubeContexts(): Promise<{ contexts: string[]; currentContext: string }> {
    try {
      const rawContexts = await invoke<string>("kube_list_contexts", { mode: "cli" });
      const contexts = parseContextNames(rawContexts);
      const currentContext = await invoke<string>("kube_current_context", { mode: "cli" }).catch(
        () => contexts[0] ?? "",
      );
      return { contexts, currentContext: currentContext.trim() || contexts[0] || "" };
    } catch {
      // Kubernetes CLI may not be configured at all — Helm target just won't be usable.
      return { contexts: [], currentContext: "" };
    }
  }

  /// Full Docker/kubectl/Helm scan — slow (real CLI process spawns), so this
  /// only ever runs in the background after an optimistic guess is already
  /// on screen. Reconciles the guess once real detection resolves.
  async function reconcileFromScratch(host: string, mode: ConnectionMode, savedTarget: KafkaTarget) {
    const [{ contexts, currentContext }, detectedDocker] = await Promise.all([
      loadKubeContexts(),
      detectDocker(host, mode).catch(() => null),
    ]);
    setKubeContexts(contexts);
    setHelmContext(currentContext);
    const detectedHelm = await detectHelm(currentContext).catch(() => null);

    const preferred = savedTarget === "docker" ? detectedDocker : detectedHelm;
    const fallback = detectedDocker ?? detectedHelm;
    const resolvedBrokers = preferred?.brokers || fallback?.brokers || "";

    if (resolvedBrokers) {
      setBrokers(resolvedBrokers);
      if (!preferred && fallback) {
        setTarget(detectedDocker ? "docker" : "helm");
      }
      void setKafkaBrokers(resolvedBrokers);
      setPhase("connected");
    } else {
      setBrokers("");
      void setKafkaBrokers("");
      setPhase("start");
    }
  }

  async function initialize() {
    setError(null);
    try {
      const [host, mode, savedTarget, savedDockerConfig, savedHelmConfig, savedBrokers] = await Promise.all([
        getDockerHost(),
        getDockerMode(),
        getKafkaTarget(),
        getKafkaDockerConfig(),
        getKafkaHelmConfig(),
        getKafkaBrokers(),
      ]);
      setDockerHost(host);
      setDockerMode(mode);
      setTarget(savedTarget);
      setDockerConfig(savedDockerConfig);
      setHelmConfig(savedHelmConfig);

      if (savedBrokers) {
        // Optimistic: render the remembered broker immediately, don't make the
        // user wait on a CLI scan just to confirm what we already believe.
        setBrokers(savedBrokers);
        setPhase("connected");
        setChecking(true);
        const stillGood = await pingBrokers(savedBrokers);
        if (stillGood) {
          void loadKubeContexts().then(({ contexts, currentContext }) => {
            setKubeContexts(contexts);
            setHelmContext(currentContext);
          });
        } else {
          await reconcileFromScratch(host, mode, savedTarget);
        }
        setChecking(false);
        return;
      }

      // No remembered broker — optimistically assume none is running yet so
      // the Start panel appears immediately, then correct in the background
      // if a broker turns out to already be reachable.
      setPhase("start");
      setChecking(true);
      await reconcileFromScratch(host, mode, savedTarget);
      setChecking(false);
    } catch (e) {
      setError(String(e));
      setPhase("start");
      setChecking(false);
    }
  }

  async function handleCreateTopic(name: string, partitions: number, replicationFactor: number) {
    setError(null);
    try {
      await invoke("kafka_create_topic", { brokers, name, partitions, replicationFactor });
      await refreshTopics();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDeleteTopic(name: string) {
    setError(null);
    try {
      await invoke("kafka_delete_topic", { brokers, name });
      if (selectedTopic === name) setSelectedTopic(null);
      await refreshTopics();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handlePurgeTopic(name: string) {
    setError(null);
    try {
      await invoke("kafka_purge_topic", { brokers, name });
    } catch (e) {
      setError(String(e));
    }
  }

  async function detectDocker(host: string, mode: ConnectionMode) {
    const raw = await invoke<string>("docker_list_containers", { host, mode });
    return detectDockerKafka(parseContainerList(raw), host);
  }

  async function detectHelm(context: string) {
    if (!context) return null;
    const raw = await invoke<string>("helm_list_releases", { context, namespace: null });
    return detectHelmKafka(parseReleaseList(raw));
  }

  function handleTargetChange(next: KafkaTarget) {
    setTarget(next);
    void setKafkaTarget(next);
  }

  function handleDockerConfigChange(cfg: KafkaDockerConfig) {
    setDockerConfig(cfg);
    void setKafkaDockerConfig(cfg);
  }

  function handleHelmConfigChange(cfg: KafkaHelmConfig) {
    setHelmConfig(cfg);
    void setKafkaHelmConfig(cfg);
  }

  function handleStarted(newBrokers: string, startedTarget: KafkaTarget) {
    setBrokers(newBrokers);
    setTarget(startedTarget);
    void setKafkaBrokers(newBrokers);
    void setKafkaTarget(startedTarget);
    setPhase("connected");
  }

  async function handleStop() {
    setError(null);
    try {
      if (target === "docker") {
        await invoke("kafka_docker_stop", {
          host: dockerHost,
          containerName: dockerConfig.containerName,
          mode: dockerMode,
          brokers,
        });
      } else {
        await invoke("kafka_helm_stop", {
          context: helmContext,
          namespace: helmConfig.namespace,
          release: helmConfig.release,
          brokers,
        });
      }
      await setKafkaBrokers("");
      setBrokers("");
      setPhase("start");
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleReset() {
    setError(null);
    try {
      if (target === "docker") {
        await invoke("kafka_docker_reset", {
          host: dockerHost,
          containerName: dockerConfig.containerName,
          image: dockerConfig.image,
          port: dockerConfig.port,
          extraEnv: dockerConfig.extraEnv,
          mode: dockerMode,
          brokers,
        });
      } else {
        await invoke("kafka_helm_reset", {
          context: helmContext,
          namespace: helmConfig.namespace,
          release: helmConfig.release,
          chart: helmConfig.chart,
          values: helmConfig.valuesOverrides,
          brokers,
        });
      }
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background px-6 py-4">
        <div>
          <h1 className="font-heading text-lg font-medium">Kafka</h1>
          <p className="text-sm text-muted-foreground">
            Browse topics, tail messages, produce, and manage a Kafka broker
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        {error && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {checking && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle className="size-3 animate-spin" />
            {phase === "start" ? "Checking for a running broker..." : "Verifying broker connection..."}
          </div>
        )}

        {phase === "start" && (
          <KafkaStartPanel
            target={target}
            onTargetChange={handleTargetChange}
            dockerHost={dockerHost}
            dockerMode={dockerMode}
            dockerConfig={dockerConfig}
            onDockerConfigChange={handleDockerConfigChange}
            kubeContexts={kubeContexts}
            helmContext={helmContext}
            onHelmContextChange={setHelmContext}
            helmConfig={helmConfig}
            onHelmConfigChange={handleHelmConfigChange}
            onStarted={handleStarted}
          />
        )}

        {phase === "connected" && (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <Waypoints className="size-4 text-muted-foreground" />
                <span className="font-mono">{brokers}</span>
              </div>
              <KafkaLifecycleControls target={target} onStop={handleStop} onReset={handleReset} />
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
              <KafkaTopicsBrowser
                topics={topics}
                selectedTopic={selectedTopic}
                onSelectTopic={setSelectedTopic}
                onRefresh={() => void refreshTopics()}
                loading={topicsLoading}
                onCreateTopic={handleCreateTopic}
                onDeleteTopic={handleDeleteTopic}
                onPurgeTopic={handlePurgeTopic}
              />
              <div className="flex min-h-0 flex-col gap-1.5">
                <Tabs defaultValue="messages" className="flex min-h-0 flex-1 flex-col gap-1.5">
                  <TabsList>
                    <TabsTrigger value="messages">Messages</TabsTrigger>
                    <TabsTrigger value="produce">Produce</TabsTrigger>
                    <TabsTrigger value="brokers">Brokers</TabsTrigger>
                  </TabsList>
                  <TabsContent value="messages" className="min-h-0 flex-1">
                    {selectedTopicObj ? (
                      <KafkaMessageViewer brokers={brokers} topic={selectedTopicObj} />
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-lg border text-center text-sm text-muted-foreground">
                        Select a topic to view messages
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="produce" className="min-h-0 flex-1">
                    <KafkaProduceForm brokers={brokers} topics={topics} initialTopic={selectedTopic ?? ""} />
                  </TabsContent>
                  <TabsContent value="brokers" className="min-h-0 flex-1">
                    <KafkaBrokersPanel brokerList={brokerList} />
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
