import { TextTransformTool, type TransformMode } from "@/features/dev-tools/text-transform-tool";
import { jsonToYaml, yamlToJson } from "@/features/dev-tools/json-yaml-logic";

const MODES: TransformMode[] = [
  {
    value: "json-to-yaml",
    label: "JSON → YAML",
    inputLabel: "JSON",
    outputLabel: "YAML",
    placeholder: '{\n  "key": "value"\n}',
    errorTitle: "Couldn't parse JSON",
    transform: jsonToYaml,
  },
  {
    value: "yaml-to-json",
    label: "YAML → JSON",
    inputLabel: "YAML",
    outputLabel: "JSON",
    placeholder: "key: value",
    errorTitle: "Couldn't parse YAML",
    transform: yamlToJson,
  },
];

export function JsonYamlConverter() {
  return (
    <TextTransformTool
      title="JSON ↔ YAML Converter"
      description="Convert between JSON and YAML"
      modes={MODES}
    />
  );
}
