import { listen } from "@tauri-apps/api/event";

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

interface WslOutputPayload {
  sessionId: number;
  data: string;
}

type OutputSink = (data: Uint8Array) => void;

/// A single global listener for `wsl-output` events, routing each session's
/// bytes to its terminal pane. Buffers output that arrives before a pane has
/// attached its sink (the backend starts emitting the moment the session
/// spawns, which is a tick before React mounts the pane and it could listen —
/// without this buffer the shell's initial prompt would be lost).
const sinks = new Map<number, OutputSink>();
const buffers = new Map<number, Uint8Array[]>();
let routerStarted = false;

export function ensureWslOutputRouter(): void {
  if (routerStarted) return;
  routerStarted = true;
  void listen<WslOutputPayload>("wsl-output", (event) => {
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

export function attachWslSink(sessionId: number, sink: OutputSink): void {
  sinks.set(sessionId, sink);
  const pending = buffers.get(sessionId);
  if (pending) {
    pending.forEach(sink);
    buffers.delete(sessionId);
  }
}

export function detachWslSink(sessionId: number): void {
  sinks.delete(sessionId);
  buffers.delete(sessionId);
}
