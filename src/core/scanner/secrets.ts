import type { Severity } from "../../types/index.js";

export interface SecretFinding {
  ruleId: string;
  severity: Severity;
  index: number;
  length: number;
}

function maskValue(value: string): string {
  if (value.length <= 8) return "[REDACTED]";
  return `${value.slice(0, 4)}...[REDACTED]...${value.slice(-4)}`;
}

export function maskSpan(text: string, index: number, length: number): string {
  const span = text.slice(index, index + length);
  return maskValue(span);
}

export function maskSpanInLine(
  text: string,
  index: number,
  length: number,
  line: number
): string {
  const lines = text.split("\n");
  const lineText = lines[line] ?? "";
  const lineStart = lines.slice(0, line).reduce((acc, l) => acc + l.length + 1, 0);
  const offsetInLine = index - lineStart;
  const span = lineText.slice(offsetInLine, offsetInLine + length);
  return lineText.slice(0, offsetInLine) + maskValue(span) + lineText.slice(offsetInLine + length);
}

export function detectSecrets(_text: string, _filePath?: string): SecretFinding[] {
  return [];
}
