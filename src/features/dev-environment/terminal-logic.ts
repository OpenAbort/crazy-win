import { listen } from "@tauri-apps/api/event";

import { base64ToUint8Array } from "@/features/dev-environment/wsl-terminal-logic";

interface TerminalOutputPayload {
  sessionId: number;
  data: string;
}

type OutputSink = (data: Uint8Array) => void;

/// A single global listener for `terminal-output` events, routing each
/// session's bytes to its terminal pane. Buffers output that arrives before a
/// pane has attached its sink (the backend starts emitting the moment the
/// session spawns, which is a tick before React mounts the pane and it could
/// listen — without this buffer the shell's initial prompt would be lost).
/// Mirrors the WSL Terminal's output router (`wsl-terminal-logic.ts`) exactly,
/// on a separate event name/session-id space so the two tools never collide.
const sinks = new Map<number, OutputSink>();
const buffers = new Map<number, Uint8Array[]>();
let routerStarted = false;

export function ensureTerminalOutputRouter(): void {
  if (routerStarted) return;
  routerStarted = true;
  void listen<TerminalOutputPayload>("terminal-output", (event) => {
    const data = base64ToUint8Array(event.payload.data);
    const sink = sinks.get(event.payload.sessionId);
    if (sink) {
      sink(data);
    } else {
      const pending = buffers.get(event.payload.sessionId) ?? [];
      pending.push(data);
      buffers.set(event.payload.sessionId, pending);
    }
  });
}

export function attachTerminalSink(sessionId: number, sink: OutputSink): void {
  sinks.set(sessionId, sink);
  const pending = buffers.get(sessionId);
  if (pending) {
    pending.forEach(sink);
    buffers.delete(sessionId);
  }
}

export function detachTerminalSink(sessionId: number): void {
  sinks.delete(sessionId);
  buffers.delete(sessionId);
}
