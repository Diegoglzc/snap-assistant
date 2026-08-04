import { type Ref } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ShopListing } from "./gemini";

interface ResultBadgeProps {
  title: string;
  content: string;
  detail?: string;
  shopListings?: ShopListing[];
  onCopy: () => void;
  copied: boolean;
}

async function visitStore(url: string) {
  await invoke("open_external_url", { url });
}

export default function ResultBadge({
  title,
  content,
  detail,
  shopListings,
  onCopy,
  copied,
  ref,
}: ResultBadgeProps & { ref?: Ref<HTMLDivElement> }) {
  const hasShopListings = !!shopListings && shopListings.length > 0;

  return (
    <div
      ref={ref}
      className="absolute -top-2 left-1/2 z-20 min-w-[380px] w-[min(calc(100vw-24px),560px)] -translate-x-1/2 -translate-y-full animate-submenu-reveal"
    >
      <div className="flex max-h-[60vh] flex-col overflow-hidden rounded-xl border border-violet-400/30 bg-slate-900 shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-white/10 bg-slate-900/95 px-3 py-2 backdrop-blur-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-300">
            {title}
          </p>
          <button
            type="button"
            onClick={onCopy}
            className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-slate-200 transition hover:border-violet-400/40 hover:bg-violet-500/15"
          >
            {copied ? "¡Copiado!" : "Copiar resultado"}
          </button>
        </div>
        <div className="overflow-y-auto px-3 py-2.5">
          {hasShopListings ? (
            <div className="space-y-2">
              {content && (
                <p className="text-sm font-medium text-slate-100">{content}</p>
              )}
              {shopListings.map((listing) => (
                <div
                  key={`${listing.storeName}-${listing.url}`}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-100">
                        {listing.storeName}
                      </p>
                      {listing.isSearchFallback && (
                        <p className="mt-0.5 text-[11px] text-amber-200/80">
                          Enlace de búsqueda
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 text-base font-semibold text-violet-200">
                      {listing.price}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void visitStore(listing.url)}
                    className="mt-2 rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-100 transition hover:border-violet-400/50 hover:bg-violet-500/20"
                  >
                    {listing.isSearchFallback ? "Buscar en tienda" : "Visitar tienda"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm text-slate-100">{content}</p>
          )}
          {detail && <p className="mt-2 text-[11px] text-slate-400">{detail}</p>}
        </div>
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
