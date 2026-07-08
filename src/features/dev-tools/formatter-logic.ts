import * as yaml from "js-yaml";
import xmlFormatter from "xml-formatter";

export type FormatLanguage = "json" | "xml" | "yaml";

export interface FormatResult {
  output: string;
  error: string | null;
}

function formatJson(input: string, minify: boolean): FormatResult {
  try {
    const value = JSON.parse(input);
    return { output: JSON.stringify(value, null, minify ? undefined : 2), error: null };
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : String(e) };
  }
}

function formatXml(input: string, minify: boolean): FormatResult {
  try {
    if (minify) {
      return { output: input.replace(/>\s+</g, "><").trim(), error: null };
    }
    return { output: xmlFormatter(input, { indentation: "  " }), error: null };
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : String(e) };
  }
}

function formatYaml(input: string): FormatResult {
  try {
    const value = yaml.load(input);
    return { output: yaml.dump(value), error: null };
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : String(e) };
  }
}

export function formatContent(
  language: FormatLanguage,
  input: string,
  minify: boolean,
): FormatResult {
  if (!input.trim()) return { output: "", error: null };
  switch (language) {
    case "json":
      return formatJson(input, minify);
    case "xml":
      return formatXml(input, minify);
    case "yaml":
      return formatYaml(input);
  }
}
