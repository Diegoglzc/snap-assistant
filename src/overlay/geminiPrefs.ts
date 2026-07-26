export const GEMINI_MODELS = [
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash (recomendado)" },
  { id: "gemini-1.5-flash-latest", label: "Gemini 1.5 Flash" },
  { id: "gemini-1.5-pro-latest", label: "Gemini 1.5 Pro" },
] as const;

export type GeminiModelId = (typeof GEMINI_MODELS)[number]["id"];

const STORAGE_KEY = "snap-assistant.gemini-model";
const DEFAULT_MODEL: GeminiModelId = "gemini-2.0-flash";

const LEGACY_MODEL_MAP: Record<string, GeminiModelId> = {
  "gemini-1.5-flash": "gemini-1.5-flash-latest",
  "gemini-1.5-pro": "gemini-1.5-pro-latest",
};

export function normalizeGeminiModelId(model: string): GeminiModelId {
  const stripped = model.replace(/^models\//, "");
  if (isGeminiModelId(stripped)) return stripped;
  if (stripped in LEGACY_MODEL_MAP) return LEGACY_MODEL_MAP[stripped];
  return DEFAULT_MODEL;
}

export function isGeminiModelId(value: string): value is GeminiModelId {
  return GEMINI_MODELS.some((model) => model.id === value);
}

export function getDefaultGeminiModel(): GeminiModelId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return normalizeGeminiModelId(stored);
  } catch {
    // ignore
  }
  return DEFAULT_MODEL;
}

export function setDefaultGeminiModel(model: GeminiModelId): void {
  try {
    localStorage.setItem(STORAGE_KEY, model);
  } catch {
    // ignore
  }
}

export function getGeminiModelLabel(model: GeminiModelId): string {
  return GEMINI_MODELS.find((entry) => entry.id === model)?.label ?? model;
}

export function getGeminiApiKey(): string {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "VITE_GEMINI_API_KEY no está configurada. Agrégala en tu archivo .env.",
    );
  }
  return key;
}
