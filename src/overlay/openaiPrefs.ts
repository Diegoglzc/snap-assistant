export const OPENAI_MODELS = [
  { id: "gpt-5-mini", label: "GPT-5 Mini (recomendado)" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini (rápido)" },
  { id: "gpt-4o", label: "GPT-4o (preciso)" },
] as const;

export type OpenAIModelId = (typeof OPENAI_MODELS)[number]["id"];

const STORAGE_KEY = "snap-assistant.openai-model";
const LEGACY_GEMINI_STORAGE_KEY = "snap-assistant.gemini-model";
const DEFAULT_MODEL: OpenAIModelId = "gpt-5-mini";

export function isOpenAIModelId(value: string): value is OpenAIModelId {
  return OPENAI_MODELS.some((model) => model.id === value);
}

export function normalizeOpenAIModelId(model: string): OpenAIModelId {
  if (isOpenAIModelId(model)) return model;
  return DEFAULT_MODEL;
}

export function getDefaultOpenAIModel(): OpenAIModelId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return normalizeOpenAIModelId(stored);

    const legacyGemini = localStorage.getItem(LEGACY_GEMINI_STORAGE_KEY);
    if (legacyGemini) return DEFAULT_MODEL;
  } catch {
    // ignore
  }
  return DEFAULT_MODEL;
}

export function setDefaultOpenAIModel(model: OpenAIModelId): void {
  try {
    localStorage.setItem(STORAGE_KEY, model);
  } catch {
    // ignore
  }
}

export function getOpenAIModelLabel(model: OpenAIModelId): string {
  return OPENAI_MODELS.find((entry) => entry.id === model)?.label ?? model;
}

export function getOpenAIApiKey(): string {
  const key = import.meta.env.VITE_OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "VITE_OPENAI_API_KEY no está configurada. Agrégala en tu archivo .env.",
    );
  }
  return key;
}
