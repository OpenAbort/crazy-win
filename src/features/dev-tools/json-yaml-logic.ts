import * as yaml from "js-yaml";

import type { TransformResult } from "@/features/dev-tools/text-transform-tool";

export function jsonToYaml(input: string): TransformResult {
  if (!input.trim()) return { output: "", error: null };
  try {
    const value = JSON.parse(input);
    return { output: yaml.dump(value), error: null };
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : String(e) };
  }
}

export function yamlToJson(input: string): TransformResult {
  if (!input.trim()) return { output: "", error: null };
  try {
    const value = yaml.load(input);
    return { output: JSON.stringify(value, null, 2), error: null };
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : String(e) };
  }
}
