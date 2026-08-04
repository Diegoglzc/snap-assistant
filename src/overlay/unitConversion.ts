export type UnitId =
  | "kg"
  | "lb"
  | "km"
  | "mi"
  | "c"
  | "f"
  | "usd"
  | "mxn"
  | "eur";

export type UnitFamily = "mass" | "distance" | "temperature" | "currency";

export interface DetectedMeasurement {
  value: number;
  unit: UnitId;
  family: UnitFamily;
  rawMatch: string;
  displayUnit: string;
}

export interface UnitOption {
  id: UnitId;
  label: string;
}

const UNIT_LABELS: Record<UnitId, string> = {
  kg: "kg",
  lb: "lb",
  km: "km",
  mi: "mi",
  c: "°C",
  f: "°F",
  usd: "USD",
  mxn: "MXN",
  eur: "EUR",
};

const FAMILY_UNITS: Record<UnitFamily, UnitId[]> = {
  mass: ["kg", "lb"],
  distance: ["km", "mi"],
  temperature: ["c", "f"],
  currency: ["usd", "mxn", "eur"],
};

/** Approximate FX rates via USD pivot (for offline quick conversion). */
const USD_RATES: Record<"usd" | "mxn" | "eur", number> = {
  usd: 1,
  mxn: 17.2,
  eur: 0.92,
};

function normalizeUnitToken(token: string): UnitId | null {
  const cleaned = token
    .trim()
    .replace(/°/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();

  switch (cleaned) {
    case "kg":
    case "kgs":
    case "kilogramo":
    case "kilogramos":
      return "kg";
    case "lb":
    case "lbs":
    case "libra":
    case "libras":
      return "lb";
    case "km":
    case "kms":
    case "kilometro":
    case "kilometros":
    case "kilómetro":
    case "kilómetros":
      return "km";
    case "mi":
    case "mile":
    case "miles":
    case "milla":
    case "millas":
      return "mi";
    case "c":
    case "celsius":
      return "c";
    case "f":
    case "fahrenheit":
      return "f";
    case "usd":
    case "us$":
    case "$":
      return "usd";
    case "mxn":
    case "mx$":
      return "mxn";
    case "eur":
    case "€":
      return "eur";
    default:
      return null;
  }
}

function familyForUnit(unit: UnitId): UnitFamily {
  if (unit === "kg" || unit === "lb") return "mass";
  if (unit === "km" || unit === "mi") return "distance";
  if (unit === "c" || unit === "f") return "temperature";
  return "currency";
}

function parseNumberToken(raw: string): number | null {
  const normalized = raw.replace(/,/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/**
 * Detects the first number+unit measurement in OCR text.
 * Supports both "12 kg" and "$12" / "USD 12" styles.
 */
export function detectMeasurement(text: string): DetectedMeasurement | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const patterns: RegExp[] = [
    /(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?)\s*(°\s*[CcFf]|kg|kgs|lb|lbs|km|kms|mi|miles?|millas?|USD|MXN|EUR|€|\$)/i,
    /(USD|MXN|EUR|US\$|MX\$|€|\$)\s*(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?)/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (!match) continue;

    let valueRaw: string;
    let unitRaw: string;

    if (match[1] && /^-?\d/.test(match[1])) {
      valueRaw = match[1];
      unitRaw = match[2] ?? "";
    } else {
      unitRaw = match[1] ?? "";
      valueRaw = match[2] ?? "";
    }

    const value = parseNumberToken(valueRaw);
    const unit = normalizeUnitToken(unitRaw);
    if (value === null || !unit) continue;

    return {
      value,
      unit,
      family: familyForUnit(unit),
      rawMatch: match[0].trim(),
      displayUnit: UNIT_LABELS[unit],
    };
  }

  return null;
}

export function getTargetUnitOptions(source: DetectedMeasurement): UnitOption[] {
  return FAMILY_UNITS[source.family]
    .filter((id) => id !== source.unit)
    .map((id) => ({ id, label: UNIT_LABELS[id] }));
}

export function defaultTargetUnit(source: DetectedMeasurement): UnitId {
  const options = getTargetUnitOptions(source);
  return options[0]?.id ?? source.unit;
}

export function convertMeasurement(
  source: DetectedMeasurement,
  targetUnit: UnitId,
): { value: number; label: string; approximate: boolean } | null {
  if (!FAMILY_UNITS[source.family].includes(targetUnit)) return null;

  let value: number;
  let approximate = false;

  switch (source.family) {
    case "mass":
      value =
        source.unit === "kg" && targetUnit === "lb"
          ? source.value * 2.2046226218
          : source.unit === "lb" && targetUnit === "kg"
            ? source.value / 2.2046226218
            : source.value;
      break;
    case "distance":
      value =
        source.unit === "km" && targetUnit === "mi"
          ? source.value * 0.6213711922
          : source.unit === "mi" && targetUnit === "km"
            ? source.value / 0.6213711922
            : source.value;
      break;
    case "temperature":
      value =
        source.unit === "c" && targetUnit === "f"
          ? (source.value * 9) / 5 + 32
          : source.unit === "f" && targetUnit === "c"
            ? ((source.value - 32) * 5) / 9
            : source.value;
      break;
    case "currency": {
      approximate = true;
      const from = USD_RATES[source.unit as "usd" | "mxn" | "eur"];
      const to = USD_RATES[targetUnit as "usd" | "mxn" | "eur"];
      value = (source.value / from) * to;
      break;
    }
    default:
      return null;
  }

  return {
    value,
    label: UNIT_LABELS[targetUnit],
    approximate,
  };
}

export function formatConvertedValue(value: number, family: UnitFamily): string {
  if (family === "temperature") {
    return value.toFixed(1).replace(/\.0$/, "");
  }
  if (family === "currency") {
    return value.toLocaleString("es-MX", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  const rounded = Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(2);
  return rounded.replace(/\.?0+$/, "");
}

export function hasConvertibleUnits(text: string): boolean {
  return detectMeasurement(text) !== null;
}
