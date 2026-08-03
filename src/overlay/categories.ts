import type { MenuCategory } from "./types";

export const MENU_CATEGORIES: MenuCategory[] = [
  {
    id: "text",
    icon: "📝",
    label: "Texto",
    actions: [
      { id: "copy", label: "Copiar", description: "Copia el texto OCR al portapapeles" },
      { id: "translate", label: "Traducir", description: "Detecta idioma origen · traduce al seleccionado" },
      { id: "summarize", label: "Resumir" },
      { id: "extract-list", label: "Extraer Lista" },
    ],
  },
  {
    id: "data",
    icon: "📊",
    label: "Datos",
    actions: [
      { id: "quick-sum", label: "Suma rápida" },
      { id: "quick-divide", label: "División" },
      { id: "quick-sqrt", label: "Raíz cuadrada" },
      { id: "quick-average", label: "Promedio" },
      { id: "export-excel", label: "Exportar Excel" },
      { id: "generate-chart", label: "Generar Gráfica" },
    ],
  },
  {
    id: "vision",
    icon: "👁️",
    label: "Visión IA",
    actions: [
      { id: "identify-object", label: "Identificar Objeto/Lugar" },
      { id: "explain-error", label: "Explicar Error" },
    ],
  },
  {
    id: "shop",
    icon: "🛒",
    label: "Shop",
    actions: [
      { id: "search-product", label: "Buscar Producto" },
      { id: "compare-prices", label: "Comparar Precios" },
    ],
  },
  {
    id: "events",
    icon: "📅",
    label: "Eventos",
    actions: [
      {
        id: "schedule",
        label: "Agendar",
        description: "Genera un evento .ics para tu calendario",
      },
      {
        id: "create-reminder",
        label: "Crear Recordatorio",
        description: "Genera un recordatorio .ics (VTODO)",
      },
    ],
  },
];

const SPANISH_DAY_PATTERN =
  /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i;
const SPANISH_MONTH_PATTERN =
  /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/i;
const NUMERIC_DATE_PATTERN = /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/;
const TIME_PATTERN =
  /\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*(?:AM|PM|a\.?\s*m\.?|p\.?\s*m\.?)\b/i;

export interface CaptureCategoryAvailability {
  text: boolean;
  data: boolean;
  events: boolean;
  shop: boolean;
  vision: boolean;
}

export function hasDatePattern(text: string): boolean {
  return (
    SPANISH_DAY_PATTERN.test(text) ||
    SPANISH_MONTH_PATTERN.test(text) ||
    NUMERIC_DATE_PATTERN.test(text) ||
    TIME_PATTERN.test(text)
  );
}

export function classifyCaptureCategories(
  ocrText: string,
  hasCapturedImage = false,
): CaptureCategoryAvailability {
  const trimmed = ocrText.trim();
  const hasText = trimmed.length > 0;
  const hasNumbers = extractNumbers(trimmed).length > 0;

  return {
    text: hasText,
    data: hasNumbers,
    events: hasDatePattern(trimmed),
    shop: hasCapturedImage,
    vision: true,
  };
}

export function extractNumbers(text: string): number[] {
  const matches =
    text.match(/-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g) ?? [];
  return matches
    .map((value) => Number(value.replace(/,/g, "")))
    .filter((value) => Number.isFinite(value));
}

export function buildQuickCalcPreview(text: string): string | null {
  const numbers = extractNumbers(text);
  if (numbers.length === 0) return null;

  const sum = numbers.reduce((total, value) => total + value, 0);
  const avg = sum / numbers.length;
  const product = numbers.slice(1).reduce((total, value) => total * value, numbers[0] ?? 1);

  return `${numbers.length} números · Σ ${sum.toFixed(2)} · μ ${avg.toFixed(2)} · × ${product.toFixed(2)}`;
}
