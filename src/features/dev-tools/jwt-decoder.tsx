import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { decodeJwt, type JwtDecodeResult } from "@/features/dev-tools/jwt-decoder-logic";

const EMPTY_RESULT: JwtDecodeResult = { header: null, payload: null, signature: null, expiry: null, error: null };

const EXPIRY_BADGE_CLASS: Record<string, string> = {
  valid: "text-emerald-600 dark:text-emerald-400",
  expired: "text-red-600 dark:text-red-400",
  none: "text-muted-foreground",
};

function OutputBox({ content, emptyLabel }: { content: string | null; emptyLabel: string }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-xs whitespace-pre-wrap break-words">
      {content ? content : <span className="text-muted-foreground">{emptyLabel}</span>}
    </div>
  );
}

export function JwtDecoder() {
  const [token, setToken] = useState("");
  const [result, setResult] = useState<JwtDecodeResult>(EMPTY_RESULT);

  useEffect(() => {
    const timer = setTimeout(() => setResult(decodeJwt(token)), 300);
    return () => clearTimeout(timer);
  }, [token]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b bg-background px-6 py-4">
        <div>
          <h1 className="font-heading text-lg font-medium">JWT Decoder</h1>
          <p className="text-sm text-muted-foreground">Decode a JSON Web Token's header, payload, and expiry</p>
        </div>
        {result.expiry && (
          <Badge variant="outline" className={EXPIRY_BADGE_CLASS[result.expiry.status]}>
            {result.expiry.label}
          </Badge>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        {result.error && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Couldn't decode token</AlertTitle>
            <AlertDescription>{result.error}</AlertDescription>
          </Alert>
        )}

        <div className="flex min-h-0 shrink-0 flex-col gap-1.5" style={{ height: "30%" }}>
          <span className="text-xs font-medium text-muted-foreground uppercase">Token</span>
          <Textarea
            value={token}
            onChange={(e) => setToken(e.target.value)}
            spellCheck={false}
            placeholder="Paste a JWT (header.payload.signature)..."
            className="h-full min-h-0 resize-none font-mono text-xs"
          />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex min-h-0 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase">Header</span>
            <OutputBox content={result.header} emptyLabel="Decoded header appears here" />
          </div>
          <div className="flex min-h-0 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase">Payload</span>
            <OutputBox content={result.payload} emptyLabel="Decoded payload appears here" />
          </div>
          <div className="flex min-h-0 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase">Signature (not verified)</span>
            <OutputBox content={result.signature} emptyLabel="Signature segment appears here" />
          </div>
        </div>
      </div>
    </div>
  );
}
