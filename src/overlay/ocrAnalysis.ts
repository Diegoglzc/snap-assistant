import { extractNumbers } from "./categories";

const LONG_TEXT_CHARS = 120;
const LONG_TEXT_WORDS = 25;

export interface OcrAnalysis {
  hasText: boolean;
  hasNumbers: boolean;
  isLongText: boolean;
  numbers: number[];
}

export function analyzeOcrText(text: string): OcrAnalysis {
  const trimmed = text.trim();
  const numbers = extractNumbers(trimmed);
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

  return {
    hasText: trimmed.length > 0,
    hasNumbers: numbers.length > 0,
    isLongText: trimmed.length > LONG_TEXT_CHARS || wordCount > LONG_TEXT_WORDS,
    numbers,
  };
}
