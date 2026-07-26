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
      { id: "apple-calendar", label: "Agendar en Apple Calendar" },
      { id: "google-calendar", label: "Agendar en Google Calendar" },
      { id: "create-reminder", label: "Crear Recordatorio" },
    ],
  },
];

export function extractNumbers(text: string): number[] {
  const matches = text.match(/-?\d+(?:[.,]\d+)?/g) ?? [];
  return matches
    .map((value) => Number(value.replace(",", ".")))
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
