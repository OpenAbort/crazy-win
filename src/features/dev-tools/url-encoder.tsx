import { TextTransformTool, type TransformMode } from "@/features/dev-tools/text-transform-tool";
import { decodeUrl, encodeUrl, parseUrl } from "@/features/dev-tools/url-encoder-logic";

const MODES: TransformMode[] = [
  {
    value: "encode",
    label: "Encode",
    inputLabel: "Text",
    outputLabel: "Encoded",
    placeholder: "Paste text to URL-encode...",
    errorTitle: "Couldn't encode text",
    transform: encodeUrl,
  },
  {
    value: "decode",
    label: "Decode",
    inputLabel: "Encoded",
    outputLabel: "Text",
    placeholder: "Paste URL-encoded text to decode...",
    errorTitle: "Couldn't decode text",
    transform: decodeUrl,
  },
  {
    value: "parse",
    label: "Parse URL",
    inputLabel: "URL",
    outputLabel: "Components",
    placeholder: "Paste a full URL to parse...",
    errorTitle: "Couldn't parse URL",
    transform: parseUrl,
  },
];

export function UrlEncoder() {
  return (
    <TextTransformTool
      title="URL Encoder"
      description="Encode, decode, and parse URLs and query strings"
      modes={MODES}
    />
  );
}
