import { useEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, Maximize2, Minimize2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const PLACEHOLDER = "# Hello\n\nWrite **Markdown** here...";

export function MarkdownViewer() {
  const [markdown, setMarkdown] = useState("");
  const [debounced, setDebounced] = useState("");
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef<"source" | "preview" | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(markdown), 300);
    return () => clearTimeout(timer);
  }, [markdown]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (!isFullscreen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsFullscreen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen]);

  function syncScroll(from: "source" | "preview") {
    if (syncingRef.current && syncingRef.current !== from) return;
    const src = from === "source" ? sourceRef.current : previewRef.current;
    const dst = from === "source" ? previewRef.current : sourceRef.current;
    if (!src || !dst) return;
    const srcMax = src.scrollHeight - src.clientHeight;
    const dstMax = dst.scrollHeight - dst.clientHeight;
    if (srcMax <= 0 || dstMax <= 0) return;
    syncingRef.current = from;
    dst.scrollTop = (src.scrollTop / srcMax) * dstMax;
    requestAnimationFrame(() => {
      syncingRef.current = null;
    });
  }

  async function copyHtml() {
    const html = renderToStaticMarkup(
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>,
    );
    await navigator.clipboard.writeText(html);
    setCopied(true);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b bg-background px-6 py-4">
        <div>
          <h1 className="font-heading text-lg font-medium">Markdown Viewer</h1>
          <p className="text-sm text-muted-foreground">
            Write Markdown on the left and preview the rendered output live on the right
          </p>
        </div>
        <Button variant="outline" onClick={() => void copyHtml()} disabled={!markdown.trim()}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy HTML"}
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-6 lg:grid-cols-2">
        <div className="flex min-h-0 flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground uppercase">Markdown</span>
          <Textarea
            ref={sourceRef}
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            onScroll={() => syncScroll("source")}
            spellCheck={false}
            placeholder={PLACEHOLDER}
            className="h-full min-h-0 resize-none font-mono text-xs"
          />
        </div>

        <div
          className={
            isFullscreen
              ? "fixed inset-0 z-50 flex flex-col gap-1.5 bg-background p-4"
              : "flex min-h-0 flex-col gap-1.5"
          }
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase">Preview</span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setIsFullscreen((v) => !v)}
              aria-label="Toggle fullscreen preview"
            >
              {isFullscreen ? <Minimize2 /> : <Maximize2 />}
            </Button>
          </div>
          <div
            ref={previewRef}
            onScroll={() => syncScroll("preview")}
            className="min-h-0 flex-1 overflow-y-auto rounded-lg border p-4"
          >
            {debounced.trim() ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{debounced}</ReactMarkdown>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                Start typing Markdown to see a live preview.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
