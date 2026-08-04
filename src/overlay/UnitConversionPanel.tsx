import { useEffect, useMemo, useState } from "react";
import {
  convertMeasurement,
  defaultTargetUnit,
  detectMeasurement,
  formatConvertedValue,
  getTargetUnitOptions,
  type UnitId,
} from "./unitConversion";

interface UnitConversionPanelProps {
  text: string;
}

export default function UnitConversionPanel({ text }: UnitConversionPanelProps) {
  const measurement = useMemo(() => detectMeasurement(text), [text]);
  const targetOptions = useMemo(
    () => (measurement ? getTargetUnitOptions(measurement) : []),
    [measurement],
  );
  const [targetUnit, setTargetUnit] = useState<UnitId | null>(null);

  useEffect(() => {
    if (!measurement) {
      setTargetUnit(null);
      return;
    }
    setTargetUnit(defaultTargetUnit(measurement));
  }, [measurement]);

  if (!measurement || !targetUnit || targetOptions.length === 0) {
    return null;
  }

  const converted = convertMeasurement(measurement, targetUnit);
  if (!converted) return null;

  return (
    <div className="rounded-xl border border-sky-400/25 bg-sky-500/10 px-3 py-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-sky-200">
        Conversión rápida
      </p>
      <p className="mt-1 text-sm text-slate-100">
        {measurement.value} {measurement.displayUnit}
        <span className="mx-1.5 text-slate-500">→</span>
        <span className="font-semibold text-sky-100">
          {formatConvertedValue(converted.value, measurement.family)}{" "}
          {converted.label}
        </span>
      </p>
      <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">
        <span className="shrink-0 text-slate-400">Convertir a:</span>
        <select
          value={targetUnit}
          onChange={(event) => setTargetUnit(event.target.value as UnitId)}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900/90 px-2 py-1.5 text-slate-100 outline-none transition focus:border-sky-400/50"
        >
          {targetOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {converted.approximate && (
        <p className="mt-1.5 text-[10px] text-slate-500">
          Tipo de cambio aproximado (referencia offline).
        </p>
      )}
      <p className="mt-1 text-[10px] text-slate-500">
        Detectado: {measurement.rawMatch}
      </p>
    </div>
  );
}
