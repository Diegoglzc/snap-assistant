import {
  getLanguageLabel,
  OUTPUT_LANGUAGES,
  type TargetLanguageCode,
} from "./translationPrefs";

interface TranslateLanguageSelectorProps {
  value: TargetLanguageCode;
  onChange: (code: TargetLanguageCode) => void;
  compact?: boolean;
}

export default function TranslateLanguageSelector({
  value,
  onChange,
  compact = false,
}: TranslateLanguageSelectorProps) {
  return (
    <label
      className={`flex items-center gap-2 ${compact ? "text-xs" : "text-sm"}`}
    >
      <span className="shrink-0 text-slate-400">Traducir a:</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as TargetLanguageCode)}
        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-800/90 px-2 py-1.5 text-slate-100 outline-none transition focus:border-violet-400/50"
      >
        {OUTPUT_LANGUAGES.map((language) => (
          <option key={language.code} value={language.code}>
            {language.label}
          </option>
        ))}
      </select>
      {!compact && (
        <span className="text-xs text-slate-500">
          Predeterminado: {getLanguageLabel(value)}
        </span>
      )}
    </label>
  );
}
