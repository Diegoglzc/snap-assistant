export const OUTPUT_LANGUAGES = [
  { code: "es", label: "Español" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
  { code: "it", label: "Italiano" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
] as const;

export type TargetLanguageCode = (typeof OUTPUT_LANGUAGES)[number]["code"];

const STORAGE_KEY = "snap-assistant.default-target-lang";
const DEFAULT_LANGUAGE: TargetLanguageCode = "es";

export function isTargetLanguageCode(value: string): value is TargetLanguageCode {
  return OUTPUT_LANGUAGES.some((language) => language.code === value);
}

export function getDefaultTargetLanguage(): TargetLanguageCode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isTargetLanguageCode(stored)) return stored;
  } catch {
    // localStorage may be unavailable
  }
  return DEFAULT_LANGUAGE;
}

export function setDefaultTargetLanguage(code: TargetLanguageCode): void {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // ignore persistence errors
  }
}

export function getLanguageLabel(code: TargetLanguageCode): string {
  return OUTPUT_LANGUAGES.find((language) => language.code === code)?.label ?? code;
}
