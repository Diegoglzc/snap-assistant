export type MathOperationId = "quick-sum" | "quick-average" | "quick-divide" | "quick-sqrt";

export interface MathResult {
  label: string;
  value: string;
  detail?: string;
}

export function computeMathOperation(
  operationId: MathOperationId,
  numbers: number[],
): MathResult | null {
  if (numbers.length === 0) return null;

  switch (operationId) {
    case "quick-sum": {
      const sum = numbers.reduce((total, value) => total + value, 0);
      return {
        label: "Suma",
        value: formatNumber(sum),
        detail: `${numbers.length} números: ${numbers.join(", ")}`,
      };
    }
    case "quick-average": {
      const sum = numbers.reduce((total, value) => total + value, 0);
      const avg = sum / numbers.length;
      return {
        label: "Promedio",
        value: formatNumber(avg),
        detail: `${numbers.length} números: ${numbers.join(", ")}`,
      };
    }
    case "quick-divide": {
      if (numbers.length < 2) {
        return {
          label: "División",
          value: "—",
          detail: "Se necesitan al menos 2 números",
        };
      }
      const [a, b] = numbers;
      if (b === 0) {
        return {
          label: "División",
          value: "—",
          detail: "División por cero",
        };
      }
      return {
        label: "División",
        value: formatNumber(a / b),
        detail: `${formatNumber(a)} ÷ ${formatNumber(b)}`,
      };
    }
    case "quick-sqrt": {
      const value = numbers[0];
      if (value < 0) {
        return {
          label: "Raíz cuadrada",
          value: "—",
          detail: "No definida para números negativos",
        };
      }
      return {
        label: "Raíz cuadrada",
        value: formatNumber(Math.sqrt(value)),
        detail: `√${formatNumber(value)}`,
      };
    }
    default:
      return null;
  }
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/\.?0+$/, "");
}
