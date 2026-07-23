import { TextTransformTool, type TransformMode } from "@/features/dev-tools/text-transform-tool";
import {
  toCamelCase,
  toConstantCase,
  toKebabCase,
  toPascalCase,
  toSnakeCase,
  toTitleCase,
} from "@/features/dev-tools/case-converter-logic";

const PLACEHOLDER = "Paste text, camelCase, snake_case, or kebab-case...";

const MODES: TransformMode[] = [
  {
    value: "camel",
    label: "camelCase",
    inputLabel: "Input",
    outputLabel: "camelCase",
    placeholder: PLACEHOLDER,
    errorTitle: "Couldn't convert text",
    transform: toCamelCase,
  },
  {
    value: "pascal",
    label: "PascalCase",
    inputLabel: "Input",
    outputLabel: "PascalCase",
    placeholder: PLACEHOLDER,
    errorTitle: "Couldn't convert text",
    transform: toPascalCase,
  },
  {
    value: "snake",
    label: "snake_case",
    inputLabel: "Input",
    outputLabel: "snake_case",
    placeholder: PLACEHOLDER,
    errorTitle: "Couldn't convert text",
    transform: toSnakeCase,
  },
  {
    value: "kebab",
    label: "kebab-case",
    inputLabel: "Input",
    outputLabel: "kebab-case",
    placeholder: PLACEHOLDER,
    errorTitle: "Couldn't convert text",
    transform: toKebabCase,
  },
  {
    value: "constant",
    label: "CONSTANT_CASE",
    inputLabel: "Input",
    outputLabel: "CONSTANT_CASE",
    placeholder: PLACEHOLDER,
    errorTitle: "Couldn't convert text",
    transform: toConstantCase,
  },
  {
    value: "title",
    label: "Title Case",
    inputLabel: "Input",
    outputLabel: "Title Case",
    placeholder: PLACEHOLDER,
    errorTitle: "Couldn't convert text",
    transform: toTitleCase,
  },
];

export function CaseConverter() {
  return (
    <TextTransformTool
      title="Case Converter"
      description="Convert text between camelCase, PascalCase, snake_case, kebab-case, and more"
      modes={MODES}
    />
  );
}
