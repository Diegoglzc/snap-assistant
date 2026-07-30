/** Preferencias legacy de Gemini — reservadas para generateContentGemini(). */

export type GeminiModelId = "gemini-2.0-flash" | "gemini-1.5-flash-latest" | "gemini-1.5-pro-latest";

const DEFAULT_GEMINI_MODEL: GeminiModelId = "gemini-2.0-flash";

export function getDefaultGeminiModel(): GeminiModelId {
  return DEFAULT_GEMINI_MODEL;
}

export function normalizeGeminiModelId(model: string): GeminiModelId {
  const stripped = model.replace(/^models\//, "");
  if (
    stripped === "gemini-2.0-flash" ||
    stripped === "gemini-1.5-flash-latest" ||
    stripped === "gemini-1.5-pro-latest"
  ) {
    return stripped;
  }
  return DEFAULT_GEMINI_MODEL;
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
