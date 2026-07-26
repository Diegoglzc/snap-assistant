import {
  getDefaultGeminiModel,
  getGeminiApiKey,
  normalizeGeminiModelId,
  type GeminiModelId,
} from "./geminiPrefs";
import type { TargetLanguageCode } from "./translationPrefs";
import { getLanguageLabel } from "./translationPrefs";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

export interface TranslateResponse {
  detected_language: string;
  translation: string;
}

async function generateContent(
  prompt: string,
  imageBase64?: string,
  model: GeminiModelId = getDefaultGeminiModel(),
): Promise<string> {
  const apiKey = getGeminiApiKey();
  const modelId = normalizeGeminiModelId(model);
  const url = `${API_BASE}/${modelId}:generateContent?key=${apiKey}`;

  const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> =
    [{ text: prompt }];

  if (imageBase64) {
    parts.push({
      inline_data: {
        mime_type: "image/png",
        data: imageBase64,
      },
    });
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 1024,
      },
    }),
  });

  const payload = (await response.json()) as GeminiResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Gemini respondió con HTTP ${response.status}`);
  }

  const text =
    payload.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text?.trim() ?? "";

  if (!text) {
    throw new Error("Gemini no devolvió contenido.");
  }

  return text;
}

function parseTranslateResponse(raw: string): TranslateResponse {
  const detected =
    raw
      .split("\n")
      .find((line) => line.trim().toUpperCase().startsWith("DETECTED:"))
      ?.trim()
      .replace(/^DETECTED:\s*/i, "") ?? "desconocido";

  const translationIndex = raw.toUpperCase().indexOf("TRANSLATION:");
  const translation =
    translationIndex >= 0
      ? raw.slice(translationIndex + "TRANSLATION:".length).trim()
      : raw.trim();

  return { detected_language: detected, translation };
}

export async function geminiTranslate(
  text: string,
  targetLang: TargetLanguageCode,
  model?: GeminiModelId,
): Promise<TranslateResponse> {
  const target = getLanguageLabel(targetLang);
  const raw = await generateContent(
    `Detecta automáticamente el idioma del texto de entrada.\nTradúcelo al ${target}.\n\nResponde EXACTAMENTE en este formato (sin markdown):\nDETECTED: [nombre del idioma detectado en español]\nTRANSLATION:\n[texto traducido únicamente]\n\nTexto:\n${text}`,
    undefined,
    model,
  );
  return parseTranslateResponse(raw);
}

export async function geminiTranslateFromImage(
  imageBase64: string,
  targetLang: TargetLanguageCode,
  model?: GeminiModelId,
): Promise<TranslateResponse> {
  const target = getLanguageLabel(targetLang);
  const raw = await generateContent(
    `Lee todo el texto visible en esta imagen. Detecta automáticamente su idioma y tradúcelo al ${target}.\n\nResponde EXACTAMENTE en este formato (sin markdown):\nDETECTED: [nombre del idioma detectado en español]\nTRANSLATION:\n[texto traducido únicamente]`,
    imageBase64,
    model,
  );
  return parseTranslateResponse(raw);
}

export async function geminiSummarize(
  text: string,
  model?: GeminiModelId,
): Promise<string> {
  return generateContent(
    `Resume el siguiente texto en exactamente 3 puntos clave concisos. Usa viñetas numeradas (1., 2., 3.):\n\n${text}`,
    undefined,
    model,
  );
}

export async function geminiSummarizeFromImage(
  imageBase64: string,
  model?: GeminiModelId,
): Promise<string> {
  return generateContent(
    "Lee el contenido visible en esta imagen y resume la información en exactamente 3 puntos clave concisos. Usa viñetas numeradas (1., 2., 3.). Responde en español.",
    imageBase64,
    model,
  );
}

export async function geminiExtractList(
  text: string,
  model?: GeminiModelId,
): Promise<string> {
  return generateContent(
    `Extrae una lista estructurada de elementos del siguiente texto. Devuelve viñetas claras:\n\n${text}`,
    undefined,
    model,
  );
}

export async function geminiExtractListFromImage(
  imageBase64: string,
  model?: GeminiModelId,
): Promise<string> {
  return generateContent(
    "Extrae una lista estructurada de elementos visibles en esta imagen. Devuelve viñetas claras en español.",
    imageBase64,
    model,
  );
}

export async function geminiIdentifyObject(
  imageBase64: string,
  contextText: string,
  model?: GeminiModelId,
): Promise<string> {
  const prompt = contextText.trim()
    ? `Contexto OCR: "${contextText}"\n\nIdentifica el objeto, producto o lugar principal en esta imagen. Responde en español con nombre, descripción breve y contexto.`
    : "Identifica el objeto, producto o lugar principal en esta imagen. Describe qué es, características visibles y contexto probable. Responde en español.";

  return generateContent(prompt, imageBase64, model);
}

export async function geminiExplainError(
  imageBase64: string,
  contextText: string,
  model?: GeminiModelId,
): Promise<string> {
  return generateContent(
    `Analiza esta captura de pantalla. Contexto OCR: "${contextText}"\n\nSi hay un error, mensaje de fallo o problema visible, explícalo en español de forma clara y sugiere pasos para resolverlo. Si no hay error evidente, describe lo que ves.`,
    imageBase64,
    model,
  );
}

export async function geminiShopSearch(
  imageBase64: string,
  contextText: string,
  model?: GeminiModelId,
): Promise<string> {
  return generateContent(
    `Analiza esta imagen de producto. Contexto OCR: "${contextText}"\n\nIdentifica el producto y sugiere 3 opciones de compra con:\n- Nombre del producto\n- Precio estimado (si inferible)\n- Enlace de búsqueda sugerido (URL de Google Shopping o Amazon)\n\nFormato en español, una opción por línea.`,
    imageBase64,
    model,
  );
}

export async function geminiExtractTextFromImage(
  imageBase64: string,
  model?: GeminiModelId,
): Promise<string> {
  return generateContent(
    "Transcribe todo el texto legible en esta imagen. Devuelve únicamente el texto detectado, preservando saltos de línea cuando sea útil.",
    imageBase64,
    model,
  );
}

function parseNumbersFromGeminiResponse(raw: string): number[] {
  const jsonMatch = raw.match(/\[[\d\s.,\-eE]+\]/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((value) => (typeof value === "number" ? value : Number(String(value).replace(",", "."))))
      .filter((value) => Number.isFinite(value));
  } catch {
    return [];
  }
}

export async function geminiExtractNumbersFromImage(
  imageBase64: string,
  model?: GeminiModelId,
): Promise<number[]> {
  const raw = await generateContent(
    `Analiza esta imagen y extrae todos los números visibles (enteros o decimales), en orden de aparición de arriba a abajo y de izquierda a derecha.

Responde ÚNICAMENTE con un array JSON válido de números, sin markdown ni texto adicional.
Ejemplo: [12.5, 3, 100]`,
    imageBase64,
    model,
  );

  return parseNumbersFromGeminiResponse(raw);
}
