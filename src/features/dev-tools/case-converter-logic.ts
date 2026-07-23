import type { TransformResult } from "@/features/dev-tools/text-transform-tool";

/// Splits camelCase/PascalCase/snake_case/kebab-case/CONSTANT_CASE/space-separated
/// input into lowercase words, so any of those can be re-joined into any other.
function splitWords(input: string): string[] {
  return input
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function convert(input: string, join: (words: string[]) => string): TransformResult {
  if (!input.trim()) return { output: "", error: null };
  try {
    const words = splitWords(input);
    if (words.length === 0) return { output: "", error: null };
    return { output: join(words), error: null };
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : String(e) };
  }
}

export const toCamelCase = (input: string): TransformResult =>
  convert(input, (words) => words.map((w, i) => (i === 0 ? w : capitalize(w))).join(""));

export const toPascalCase = (input: string): TransformResult =>
  convert(input, (words) => words.map(capitalize).join(""));

export const toSnakeCase = (input: string): TransformResult =>
  convert(input, (words) => words.join("_"));

export const toKebabCase = (input: string): TransformResult =>
  convert(input, (words) => words.join("-"));

export const toConstantCase = (input: string): TransformResult =>
  convert(input, (words) => words.map((w) => w.toUpperCase()).join("_"));

export const toTitleCase = (input: string): TransformResult =>
  convert(input, (words) => words.map(capitalize).join(" "));
