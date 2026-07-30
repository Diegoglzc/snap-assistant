import {
  getOpenAIModelLabel,
  OPENAI_MODELS,
  type OpenAIModelId,
} from "./openaiPrefs";

interface OpenAIModelSelectorProps {
  value: OpenAIModelId;
  onChange: (model: OpenAIModelId) => void;
  compact?: boolean;
}

export default function OpenAIModelSelector({
  value,
  onChange,
  compact = false,
}: OpenAIModelSelectorProps) {
  return (
    <label
      className={`flex items-center gap-2 ${compact ? "text-xs" : "text-sm"}`}
    >
      <span className="shrink-0 text-slate-400">Modelo OpenAI:</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as OpenAIModelId)}
        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-800/90 px-2 py-1.5 text-slate-100 outline-none transition focus:border-violet-400/50"
      >
        {OPENAI_MODELS.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label}
          </option>
        ))}
      </select>
      {!compact && (
        <span className="text-xs text-slate-500">
          Activo: {getOpenAIModelLabel(value)}
        </span>
      )}
    </label>
  );
}
