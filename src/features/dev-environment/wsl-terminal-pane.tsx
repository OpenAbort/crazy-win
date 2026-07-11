import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import { attachWslSink, detachWslSink } from "@/features/dev-environment/wsl-terminal-logic";

import "@xterm/xterm/css/xterm.css";

interface WslSessionClosedPayload {
  sessionId: number;
  exitCode: number | null;
}

/// Hosts one xterm.js instance attached to an already-running session.
/// Session creation happens in the orchestrator's discrete "New tab" handler,
/// never in a mount effect here — React 19 StrictMode double-invokes mount
/// effects in dev, which would otherwise spawn two real WSL processes. Output
/// is delivered via the global router (`attachWslSink`), which buffers any
/// bytes emitted before this pane mounts so the initial prompt isn't lost.
export function WslTerminalPane({ sessionId, active }: { sessionId: number; active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      theme: { background: "#00000000" },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Wire input BEFORE routing output in. The shell's startup sequence
    // includes a cursor-position query (`ESC[6n`) that it blocks on until the
    // terminal replies; xterm generates that reply through `onData`, so the
    // handler must be registered before that query is written into xterm.
    const dataDisposable = term.onData((data) => {
      void invoke("wsl_write", { sessionId, data });
    });

    // Route this session's output (incl. anything buffered before mount) here.
    attachWslSink(sessionId, (data) => term.write(data));

    // The container may not have its final size on the same tick it's opened
    // (flex layout settles a frame later), so fit once the layout is stable
    // and push the real dimensions to the PTY.
    requestAnimationFrame(() => {
      fitAddon.fit();
      void invoke("wsl_resize", { sessionId, cols: term.cols, rows: term.rows });
      term.focus();
    });

    let resizeTimeout: ReturnType<typeof setTimeout> | undefined;
    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        fitAddon.fit();
        void invoke("wsl_resize", { sessionId, cols: term.cols, rows: term.rows });
      }, 120);
    });
    resizeObserver.observe(container);

    const unlistenClosed = listen<WslSessionClosedPayload>("wsl-session-closed", (event) => {
      if (event.payload.sessionId !== sessionId) return;
      term.write(`\r\n\x1b[90m[process exited${event.payload.exitCode !== null ? ` (${event.payload.exitCode})` : ""}]\x1b[0m\r\n`);
    });

    return () => {
      dataDisposable.dispose();
      resizeObserver.disconnect();
      clearTimeout(resizeTimeout);
      detachWslSink(sessionId);
      void unlistenClosed.then((f) => f());
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId]);

  useEffect(() => {
    if (active) {
      termRef.current?.focus();
      // A tab that was hidden may have missed resize events; re-fit on show.
      fitAddonRef.current?.fit();
    }
  }, [active]);

  return (
    <div
      ref={containerRef}
      onClick={() => termRef.current?.focus()}
      className="h-full w-full"
      style={{ display: active ? "block" : "none" }}
    />
  );
}
