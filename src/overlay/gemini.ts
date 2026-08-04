import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import {
  getDefaultGeminiModel,
  normalizeGeminiModelId,
  type GeminiModelId,
} from "./geminiPrefs";
import {
  getDefaultOpenAIModel,
  normalizeOpenAIModelId,
  type OpenAIModelId,
} from "./openaiPrefs";
import type { TargetLanguageCode } from "./translationPrefs";
import { getLanguageLabel } from "./translationPrefs";

let openaiClient: OpenAI | null = null;
let geminiClient: GoogleGenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (openaiClient) return openaiClient;

  const apiKey = import.meta.env.VITE_OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Configura tu API key de OpenAI en Ajustes");
  }

  try {
    openaiClient = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true,
    });
  } catch {
    throw new Error("Configura tu API key de OpenAI en Ajustes");
  }

  return openaiClient;
}

function getGeminiClient(): GoogleGenAI {
  if (geminiClient) return geminiClient;

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Configura tu API key de Gemini en Ajustes");
  }

  try {
    geminiClient = new GoogleGenAI({ apiKey });
  } catch {
    throw new Error("Configura tu API key de Gemini en Ajustes");
  }

  return geminiClient;
}

export interface TranslateResponse {
  detected_language: string;
  translation: string;
}

async function generateContent(
  prompt: string,
  imageBase64?: string,
  model?: OpenAIModelId,
): Promise<string> {
  const client = getOpenAIClient();
  const modelId = model ? normalizeOpenAIModelId(model) : getDefaultOpenAIModel();

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: prompt },
  ];

  if (imageBase64) {
    content.push({
      type: "image_url",
      image_url: {
        url: `data:image/png;base64,${imageBase64}`,
      },
    });
  }

  const response = await client.chat.completions.create({
    model: modelId,
    messages: [{ role: "user", content }],
    temperature: 0.4,
    max_tokens: 1024,
  });

  const text = response.choices[0]?.message?.content?.trim() ?? "";

  if (!text) {
    throw new Error("OpenAI no devolvió contenido.");
  }

  return text;
}

async function generateContentGemini(
  prompt: string,
  imageBase64?: string,
  model: GeminiModelId = getDefaultGeminiModel(),
): Promise<string> {
  const client = getGeminiClient();
  const modelId = normalizeGeminiModelId(model);

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> =
    [{ text: prompt }];

  if (imageBase64) {
    parts.push({
      inlineData: {
        mimeType: "image/png",
        data: imageBase64,
      },
    });
  }

  const response = await client.models.generateContent({
    model: modelId,
    contents: [{ parts }],
    config: {
      temperature: 0.4,
      maxOutputTokens: 1024,
    },
  });

  const text = response.text?.trim() ?? "";

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
  model?: OpenAIModelId,
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
  model?: OpenAIModelId,
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
  model?: OpenAIModelId,
): Promise<string> {
  return generateContent(
    `Resume el siguiente texto en exactamente 3 puntos clave concisos. Usa viñetas numeradas (1., 2., 3.):\n\n${text}`,
    undefined,
    model,
  );
}

export async function geminiSummarizeFromImage(
  imageBase64: string,
  model?: OpenAIModelId,
): Promise<string> {
  return generateContent(
    "Lee el contenido visible en esta imagen y resume la información en exactamente 3 puntos clave concisos. Usa viñetas numeradas (1., 2., 3.). Responde en español.",
    imageBase64,
    model,
  );
}

export async function geminiExtractList(
  text: string,
  model?: OpenAIModelId,
): Promise<string> {
  return generateContent(
    `Extrae una lista estructurada de elementos del siguiente texto. Devuelve viñetas claras:\n\n${text}`,
    undefined,
    model,
  );
}

export async function geminiExtractListFromImage(
  imageBase64: string,
  model?: OpenAIModelId,
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
  model?: OpenAIModelId,
): Promise<string> {
  const prompt = contextText.trim()
    ? `Contexto OCR: "${contextText}"\n\nIdentifica el objeto, producto o lugar principal en esta imagen. Responde en español con nombre, descripción breve y contexto.`
    : "Identifica el objeto, producto o lugar principal en esta imagen. Describe qué es, características visibles y contexto probable. Responde en español.";

  return generateContent(prompt, imageBase64, model);
}

export async function geminiExplainError(
  imageBase64: string,
  contextText: string,
  model?: OpenAIModelId,
): Promise<string> {
  return generateContent(
    `Analiza esta captura de pantalla. Contexto OCR: "${contextText}"\n\nSi hay un error, mensaje de fallo o problema visible, explícalo en español de forma clara y sugiere pasos para resolverlo. Si no hay error evidente, describe lo que ves.`,
    imageBase64,
    model,
  );
}

export const SHOP_NO_PRODUCT_MESSAGE =
  "No se identificó un producto específico en esta selección";

export interface ShopListing {
  storeName: string;
  price: string;
  priceValue: number | null;
  url: string;
  /** True when the URL is a store search page, not a direct product page. */
  isSearchFallback: boolean;
}

export interface ShopSearchResponse {
  productName: string | null;
  listings: ShopListing[];
  noProductIdentified: boolean;
  message?: string;
}

const SHOP_WEB_SEARCH_MODEL = "gpt-4o-mini";

function buildShopPrompt(contextText: string): string {
  return `Identifica el producto comprable en la imagen adjunta y usa la herramienta de búsqueda web para encontrar precios reales en tiendas en línea.

Contexto OCR: "${contextText}"

Prioriza tiendas como Amazon, Mercado Libre y al menos una tienda adicional relevante según el producto y la región (México/LATAM cuando aplique).

Si NO puedes identificar claramente un producto comprable específico en la imagen, responde ÚNICAMENTE con este texto exacto, sin comillas ni markdown:
${SHOP_NO_PRODUCT_MESSAGE}

Si sí identificas un producto, usa los resultados reales de la búsqueda web y responde ÚNICAMENTE con JSON válido (sin markdown ni texto adicional) con esta forma:
{
  "productName": "nombre del producto",
  "listings": [
    {
      "storeName": "Amazon",
      "price": "$1,299.00",
      "priceValue": 1299,
      "url": "https://www.amazon.com.mx/dp/...",
      "isSearchFallback": false
    }
  ]
}

Reglas estrictas:
- NO inventes URLs de producto. Solo usa URLs que aparezcan en los resultados de la búsqueda web.
- Si para una tienda no encuentras la página específica del producto, usa un enlace de búsqueda de esa tienda (ej. https://www.amazon.com.mx/s?k=<término_codificado> o https://listado.mercadolibre.com.mx/<término>) y marca "isSearchFallback": true.
- Si sí tienes la URL real de la página del producto, marca "isSearchFallback": false.
- Incluye entre 3 y 6 tiendas cuando sea posible.
- Cada listing debe tener storeName, price (legible con moneda), priceValue (número para ordenar), url e isSearchFallback.
- Ordena listings de menor a mayor priceValue.
- No inventes precios: usa los que aparezcan en la búsqueda o, si solo hay enlace de búsqueda, indica un precio aproximado visible o "Consultar" con priceValue null.`;
}

function parsePriceValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractResponsesOutputText(response: {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
}): string {
  const direct = response.output_text?.trim();
  if (direct) return direct;

  const parts: string[] = [];
  for (const item of response.output ?? []) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}

function looksLikeSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    const query = parsed.search.toLowerCase();
    return (
      path.includes("/s") ||
      path.includes("/search") ||
      path.includes("/listado") ||
      query.includes("k=") ||
      query.includes("q=") ||
      query.includes("search")
    );
  } catch {
    return false;
  }
}

function parseShopSearchResponse(raw: string): ShopSearchResponse {
  const trimmed = raw.trim();

  if (
    trimmed === SHOP_NO_PRODUCT_MESSAGE ||
    trimmed.includes(SHOP_NO_PRODUCT_MESSAGE)
  ) {
    return {
      productName: null,
      listings: [],
      noProductIdentified: true,
      message: SHOP_NO_PRODUCT_MESSAGE,
    };
  }

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      productName: null,
      listings: [],
      noProductIdentified: true,
      message: SHOP_NO_PRODUCT_MESSAGE,
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      productName?: unknown;
      listings?: Array<{
        storeName?: unknown;
        price?: unknown;
        priceValue?: unknown;
        url?: unknown;
        isSearchFallback?: unknown;
      }>;
    };

    const listings = (parsed.listings ?? [])
      .map((listing) => {
        const storeName =
          typeof listing.storeName === "string" ? listing.storeName.trim() : "";
        const price =
          typeof listing.price === "string" && listing.price.trim()
            ? listing.price.trim()
            : "Consultar";
        const url = typeof listing.url === "string" ? listing.url.trim() : "";
        const priceValue = parsePriceValue(listing.priceValue ?? listing.price);
        const flaggedFallback = listing.isSearchFallback === true;
        const isSearchFallback = flaggedFallback || looksLikeSearchUrl(url);

        if (!storeName || !url) return null;

        return {
          storeName,
          price,
          priceValue,
          url,
          isSearchFallback,
        } satisfies ShopListing;
      })
      .filter((listing): listing is ShopListing => listing !== null)
      .sort((a, b) => {
        const left = a.priceValue ?? Number.POSITIVE_INFINITY;
        const right = b.priceValue ?? Number.POSITIVE_INFINITY;
        return left - right;
      });

    if (listings.length === 0) {
      return {
        productName: null,
        listings: [],
        noProductIdentified: true,
        message: SHOP_NO_PRODUCT_MESSAGE,
      };
    }

    const productName =
      typeof parsed.productName === "string" && parsed.productName.trim()
        ? parsed.productName.trim()
        : null;

    return {
      productName,
      listings,
      noProductIdentified: false,
    };
  } catch {
    return {
      productName: null,
      listings: [],
      noProductIdentified: true,
      message: SHOP_NO_PRODUCT_MESSAGE,
    };
  }
}

async function generateShopContentWithWebSearch(
  prompt: string,
  imageBase64: string,
): Promise<string> {
  const client = getOpenAIClient();

  const response = await client.responses.create({
    model: SHOP_WEB_SEARCH_MODEL,
    tools: [{ type: "web_search" }],
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          {
            type: "input_image",
            detail: "auto",
            image_url: `data:image/png;base64,${imageBase64}`,
          },
        ],
      },
    ],
  });

  const text = extractResponsesOutputText(response);
  if (!text) {
    throw new Error("OpenAI no devolvió contenido para la búsqueda de producto.");
  }

  return text;
}

export async function geminiShopSearch(
  imageBase64: string,
  contextText: string,
): Promise<ShopSearchResponse> {
  const raw = await generateShopContentWithWebSearch(
    buildShopPrompt(contextText),
    imageBase64,
  );
  return parseShopSearchResponse(raw);
}

export async function geminiExtractTextFromImage(
  imageBase64: string,
  model?: OpenAIModelId,
): Promise<string> {
  return generateContent(
    "Transcribe todo el texto legible en esta imagen. Devuelve únicamente el texto detectado, preservando saltos de línea cuando sea útil.",
    imageBase64,
    model,
  );
}

export interface ExtractedCalendarEvent {
  title: string;
  startIso: string;
  endIso: string;
  location?: string;
  description?: string;
}

function parseCalendarEventResponse(raw: string): ExtractedCalendarEvent {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No se pudo interpretar la fecha/hora del evento.");
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    title?: unknown;
    startIso?: unknown;
    endIso?: unknown;
    location?: unknown;
    description?: unknown;
  };

  const title =
    typeof parsed.title === "string" && parsed.title.trim()
      ? parsed.title.trim()
      : "Evento";

  if (typeof parsed.startIso !== "string" || !parsed.startIso.trim()) {
    throw new Error("No se detectó una fecha/hora válida para agendar.");
  }

  const start = new Date(parsed.startIso);
  if (Number.isNaN(start.getTime())) {
    throw new Error("La fecha de inicio del evento no es válida.");
  }

  let end: Date;
  if (typeof parsed.endIso === "string" && parsed.endIso.trim()) {
    end = new Date(parsed.endIso);
    if (Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
      end = new Date(start.getTime() + 60 * 60 * 1000);
    }
  } else {
    end = new Date(start.getTime() + 60 * 60 * 1000);
  }

  return {
    title,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    location:
      typeof parsed.location === "string" && parsed.location.trim()
        ? parsed.location.trim()
        : undefined,
    description:
      typeof parsed.description === "string" && parsed.description.trim()
        ? parsed.description.trim()
        : undefined,
  };
}

function buildCalendarExtractPrompt(contextText: string, nowIso: string): string {
  return `Extrae el evento o recordatorio principal de este contenido.

Ahora es: ${nowIso}
Contexto OCR: "${contextText}"

Responde ÚNICAMENTE con JSON válido (sin markdown):
{
  "title": "título corto del evento",
  "startIso": "YYYY-MM-DDTHH:mm:ss.sssZ",
  "endIso": "YYYY-MM-DDTHH:mm:ss.sssZ",
  "location": "lugar opcional o null",
  "description": "notas opcionales o null"
}

Reglas:
- startIso es obligatorio y debe ser una fecha/hora absoluta ISO-8601 en UTC.
- Si no hay duración explícita, endIso = startIso + 1 hora.
- Si solo hay fecha sin hora, usa 09:00 hora local convertida a UTC.
- Si el año no aparece, asume el más cercano futuro a partir de ahora.
- title: resume el evento en pocas palabras (no copies todo el OCR).
- No inventes eventos si no hay fecha/hora detectables; en ese caso usa la mejor interpretación posible del texto.`;
}

export async function geminiExtractCalendarEvent(
  contextText: string,
  imageBase64?: string,
  model?: OpenAIModelId,
): Promise<ExtractedCalendarEvent> {
  const nowIso = new Date().toISOString();
  const prompt = buildCalendarExtractPrompt(contextText, nowIso);
  const raw = await generateContent(
    imageBase64
      ? `${prompt}\n\nSi el OCR está vacío o incompleto, también usa la imagen adjunta.`
      : prompt,
    imageBase64,
    model,
  );
  return parseCalendarEventResponse(raw);
}

function parseNumbersFromResponse(raw: string): number[] {
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
  model?: OpenAIModelId,
): Promise<number[]> {
  const raw = await generateContent(
    `Analiza esta imagen y extrae todos los números visibles (enteros o decimales), en orden de aparición de arriba a abajo y de izquierda a derecha.

Responde ÚNICAMENTE con un array JSON válido de números, sin markdown ni texto adicional.
Ejemplo: [12.5, 3, 100]`,
    imageBase64,
    model,
  );

  return parseNumbersFromResponse(raw);
}

// --- Implementaciones Gemini (reservadas para uso futuro) ---

export async function geminiTranslateWithGemini(
  text: string,
  targetLang: TargetLanguageCode,
  model?: GeminiModelId,
): Promise<TranslateResponse> {
  const target = getLanguageLabel(targetLang);
  const raw = await generateContentGemini(
    `Detecta automáticamente el idioma del texto de entrada.\nTradúcelo al ${target}.\n\nResponde EXACTAMENTE en este formato (sin markdown):\nDETECTED: [nombre del idioma detectado en español]\nTRANSLATION:\n[texto traducido únicamente]\n\nTexto:\n${text}`,
    undefined,
    model,
  );
  return parseTranslateResponse(raw);
}

export { generateContentGemini };
