interface ResultBadgeProps {
  title: string;
  content: string;
  detail?: string;
  onCopy: () => void;
  copied: boolean;
}

export default function ResultBadge({
  title,
  content,
  detail,
  onCopy,
  copied,
}: ResultBadgeProps) {
  return (
    <div className="absolute -top-2 left-1/2 z-20 w-[min(92vw,480px)] -translate-x-1/2 -translate-y-full animate-submenu-reveal">
      <div className="rounded-xl border border-violet-400/30 bg-slate-900 px-3 py-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-300">
            {title}
          </p>
          <button
            type="button"
            onClick={onCopy}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-slate-200 transition hover:border-violet-400/40 hover:bg-violet-500/15"
          >
            {copied ? "¡Copiado!" : "Copiar resultado"}
          </button>
        </div>
        <p className="whitespace-pre-wrap text-sm text-slate-100">{content}</p>
        {detail && <p className="mt-1 text-[11px] text-slate-400">{detail}</p>}
      </div>
    </div>
  );
}

interface ToastProps {
  message: string;
}

export function CopyToast({ message }: ToastProps) {
  if (!message) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 animate-submenu-reveal">
      <div className="rounded-full border border-emerald-400/30 bg-emerald-950/90 px-4 py-2 text-sm font-medium text-emerald-100 shadow-lg">
        {message}
      </div>
    </div>
  );
}
