import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Code, Eye } from "lucide-react";
import { classifyCaptureCategories, MENU_CATEGORIES } from "./categories";
import { copyToClipboard } from "./clipboard";
import {
  geminiExplainError,
  geminiExtractCalendarEvent,
  geminiExtractList,
  geminiExtractListFromImage,
  geminiExtractNumbersFromImage,
  geminiIdentifyObject,
  geminiShopSearch,
  geminiSummarize,
  geminiSummarizeFromImage,
  geminiTranslate,
  geminiTranslateFromImage,
  SHOP_NO_PRODUCT_MESSAGE,
  type ShopListing,
} from "./gemini";
import { buildEventIcs, buildTodoIcs, downloadIcsFile } from "./ics";
import { computeMathOperation, type MathOperationId } from "./mathOperations";
import { analyzeOcrText } from "./ocrAnalysis";
import ResultBadge, { CopyToast } from "./ResultBadge";
import TranslateLanguageSelector from "./TranslateLanguageSelector";
import {
  getDefaultTargetLanguage,
  getLanguageLabel,
  setDefaultTargetLanguage,
  type TargetLanguageCode,
} from "./translationPrefs";
import { useDraggableMenu } from "./useDraggableMenu";
import type { MenuCategoryId, ProcessCaptureResult, SelectionRect } from "./types";

interface FloatingActionMenuProps {
  selection: SelectionRect;
  session: ProcessCaptureResult | null;
  ocrLoading: boolean;
  captureError: string | null;
  onClose: () => void;
}

interface ActionLoading {
  categoryId: MenuCategoryId;
  actionId: string;
}

interface ResultState {
  title: string;
  content: string;
  detail?: string;
  shopListings?: ShopListing[];
}

const MATH_ACTIONS = new Set([
  "quick-sum",
  "quick-average",
  "quick-divide",
  "quick-sqrt",
]);

const DATA_NUMERIC_ACTIONS = new Set([
  "quick-sum",
  "quick-average",
  "quick-divide",
  "quick-sqrt",
]);

const TEXT_GEMINI_ACTIONS = new Set(["translate", "summarize", "extract-list"]);

function isGeminiAction(categoryId: MenuCategoryId, actionId: string): boolean {
  if (categoryId === "text") {
    return TEXT_GEMINI_ACTIONS.has(actionId);
  }
  if (categoryId === "vision") return true;
  if (categoryId === "shop") return true;
  return false;
}

export default function FloatingActionMenu({
  selection,
  session,
  ocrLoading,
  captureError,
  onClose,
}: FloatingActionMenuProps) {
  const [activeCategory, setActiveCategory] = useState<MenuCategoryId>("text");
  const [loadingAction, setLoadingAction] = useState<ActionLoading | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [toast, setToast] = useState("");
  const [resultCopied, setResultCopied] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState<TargetLanguageCode>(
    getDefaultTargetLanguage,
  );
  const toastTimer = useRef<number | null>(null);
  const resultPanelRef = useRef<HTMLDivElement>(null);
  const guardrailsApplied = useRef(false);

  const layoutKey = `${activeCategory}:${ocrLoading ? "loading" : "ready"}:${result ? "result" : "none"}`;
  const {
    menuRef,
    position,
    isDragging,
    isVisible,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    repositionForResultPanel,
  } = useDraggableMenu({ selection, layoutKey });

  const ocrPreview = session?.ocr_text?.trim() ?? "";
  const analysis = useMemo(() => analyzeOcrText(ocrPreview), [ocrPreview]);
  const imageBase64 = session?.capture.image_base64 ?? "";
  const hasCapturedImage = !!imageBase64;
  const categoryAvailability = useMemo(
    () => classifyCaptureCategories(ocrPreview, hasCapturedImage),
    [ocrPreview, hasCapturedImage],
  );
  const hasText = analysis.hasText;

  const showCopiedToast = useCallback((message = "¡Copiado!") => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2000);
  }, []);

  useEffect(() => {
    guardrailsApplied.current = false;
    setActiveCategory("text");
    setResult(null);
    setLoadingAction(null);
    setTargetLanguage(getDefaultTargetLanguage());
  }, [selection]);

  const handleTargetLanguageChange = (code: TargetLanguageCode) => {
    setTargetLanguage(code);
    setDefaultTargetLanguage(code);
  };

  useEffect(() => {
    if (ocrLoading || guardrailsApplied.current || captureError) return;
    guardrailsApplied.current = true;

    if (!hasText && hasCapturedImage) {
      setActiveCategory("vision");
    }
  }, [ocrLoading, hasText, hasCapturedImage, captureError]);

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  useLayoutEffect(() => {
    if (!result || !isVisible) return;

    const resultPanel = resultPanelRef.current;
    if (!resultPanel) return;

    const resultHeight = resultPanel.getBoundingClientRect().height;
    repositionForResultPanel(resultHeight);
  }, [result, isVisible, repositionForResultPanel]);

  const isActionDisabled = (
    categoryId: MenuCategoryId,
    actionId: string,
  ): boolean => {
    if (captureError) return true;

    if (categoryId === "vision" || categoryId === "shop") {
      return !hasCapturedImage;
    }

    if (categoryId === "events") {
      return !hasText && !hasCapturedImage;
    }

    if (categoryId === "text" && actionId === "copy") {
      return ocrLoading || !hasText;
    }

    if (categoryId === "text" && TEXT_GEMINI_ACTIONS.has(actionId)) {
      return !hasText && !hasCapturedImage;
    }

    if (categoryId === "data" && DATA_NUMERIC_ACTIONS.has(actionId)) {
      if (analysis.hasNumbers) return false;
      return !hasCapturedImage;
    }

    if (["export-excel", "generate-chart"].includes(actionId)) {
      if (analysis.hasNumbers) return false;
      return !hasCapturedImage;
    }

    return false;
  };

  const isActionHighlighted = (categoryId: MenuCategoryId, actionId: string) => {
    if (
      categoryId === "text" &&
      analysis.isLongText &&
      (actionId === "translate" || actionId === "summarize")
    ) {
      return true;
    }

    if (
      categoryId === "vision" &&
      actionId === "explain-error" &&
      categoryAvailability.looksLikeCode
    ) {
      return true;
    }

    return false;
  };

  function renderActionIcon(actionId: string) {
    if (actionId === "explain-error") {
      return <Code className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />;
    }
    if (actionId === "identify-object") {
      return <Eye className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />;
    }
    return null;
  }

  const isCategoryDimmed = useCallback(
    (categoryId: MenuCategoryId) => {
      if (captureError) return categoryId !== "text";

      if (categoryId === "data") {
        return !analysis.hasNumbers && !hasCapturedImage;
      }

      return !categoryAvailability[categoryId];
    },
    [analysis.hasNumbers, captureError, categoryAvailability, hasCapturedImage],
  );

  useEffect(() => {
    if (ocrLoading || captureError) return;
    if (!isCategoryDimmed(activeCategory)) return;

    const fallbackCategory = MENU_CATEGORIES.find(
      (category) => !isCategoryDimmed(category.id),
    )?.id;

    if (fallbackCategory && fallbackCategory !== activeCategory) {
      setActiveCategory(fallbackCategory);
    }
  }, [
    activeCategory,
    captureError,
    isCategoryDimmed,
    ocrLoading,
  ]);

  const handleCopy = async (text: string) => {
    await copyToClipboard(text);
    showCopiedToast();
  };

  const handleAction = async (categoryId: MenuCategoryId, actionId: string) => {
    if (isActionDisabled(categoryId, actionId)) return;
    if (loadingAction) return;

    setResult(null);
    setResultCopied(false);

    if (categoryId === "text" && actionId === "copy") {
      await handleCopy(ocrPreview);
      return;
    }

    if (categoryId === "data" && MATH_ACTIONS.has(actionId)) {
      setLoadingAction({ categoryId, actionId });

      try {
        let numbers = analysis.numbers;
        let detailSuffix = "";

        if (numbers.length === 0 && hasCapturedImage) {
          numbers = await geminiExtractNumbersFromImage(imageBase64);
          detailSuffix = " · números detectados con Gemini";
        }

        const mathResult = computeMathOperation(actionId as MathOperationId, numbers);
        if (mathResult) {
          setResult({
            title: mathResult.label,
            content: mathResult.value,
            detail: `${mathResult.detail ?? ""}${detailSuffix}`.trim() || undefined,
          });
        } else {
          setResult({
            title: "Sin números",
            content: "No se encontraron números en la captura.",
          });
        }
      } catch (error) {
        setResult({
          title: "Error",
          content: String(error),
        });
      } finally {
        setLoadingAction(null);
      }
      return;
    }

    if (categoryId === "events" && (actionId === "schedule" || actionId === "create-reminder")) {
      setLoadingAction({ categoryId, actionId });

      try {
        const extracted = await geminiExtractCalendarEvent(
          ocrPreview,
          hasCapturedImage ? imageBase64 : undefined,
        );

        const details = {
          title: extracted.title,
          start: new Date(extracted.startIso),
          end: new Date(extracted.endIso),
          location: extracted.location,
          description:
            extracted.description ??
            (ocrPreview.slice(0, 500) || undefined),
        };

        const ics =
          actionId === "create-reminder"
            ? buildTodoIcs(details)
            : buildEventIcs(details);

        downloadIcsFile(
          ics,
          details.title,
          actionId === "create-reminder" ? "todo" : "event",
        );

        const startLabel = details.start.toLocaleString("es-MX", {
          dateStyle: "medium",
          timeStyle: "short",
        });
        const endLabel = details.end.toLocaleString("es-MX", {
          dateStyle: "medium",
          timeStyle: "short",
        });

        setResult({
          title: actionId === "create-reminder" ? "Recordatorio" : "Evento",
          content: `${details.title}\n${startLabel} → ${endLabel}`,
          detail: details.location
            ? `Lugar: ${details.location} · Archivo .ics descargado`
            : "Archivo .ics descargado — ábrelo para agregar a tu calendario",
        });
      } catch (error) {
        setResult({
          title: "Error",
          content: String(error),
        });
      } finally {
        setLoadingAction(null);
      }
      return;
    }

    if (!isGeminiAction(categoryId, actionId)) {
      console.info(`Action pending: ${categoryId}/${actionId}`);
      return;
    }

    setLoadingAction({ categoryId, actionId });

    try {
      let content = "";
      const usedImageFallback = !hasText && hasCapturedImage;

      if (categoryId === "text" && actionId === "translate") {
        const translated = hasText
          ? await geminiTranslate(ocrPreview, targetLanguage)
          : await geminiTranslateFromImage(imageBase64, targetLanguage);
        setResult({
          title: `Traducción (${getLanguageLabel(targetLanguage)})`,
          content: translated.translation,
          detail: `Idioma detectado: ${translated.detected_language}${usedImageFallback ? " · vía Gemini (imagen)" : ""}`,
        });
        return;
      }

      if (categoryId === "text" && actionId === "summarize") {
        content = hasText
          ? await geminiSummarize(ocrPreview)
          : await geminiSummarizeFromImage(imageBase64);
      } else if (categoryId === "text" && actionId === "extract-list") {
        content = hasText
          ? await geminiExtractList(ocrPreview)
          : await geminiExtractListFromImage(imageBase64);
      } else if (categoryId === "vision" && actionId === "identify-object") {
        content = await geminiIdentifyObject(imageBase64, ocrPreview);
      } else if (categoryId === "vision" && actionId === "explain-error") {
        content = await geminiExplainError(imageBase64, ocrPreview);
      } else if (categoryId === "shop") {
        const shopResult = await geminiShopSearch(imageBase64, ocrPreview);

        const actionLabel =
          MENU_CATEGORIES.find((c) => c.id === categoryId)?.actions.find(
            (a) => a.id === actionId,
          )?.label ?? "Buscar Producto";

        if (shopResult.noProductIdentified) {
          setResult({
            title: actionLabel,
            content: shopResult.message ?? SHOP_NO_PRODUCT_MESSAGE,
            detail: "Búsqueda web con OpenAI",
          });
          return;
        }

        setResult({
          title: actionLabel,
          content: shopResult.productName ?? "Producto identificado",
          shopListings: shopResult.listings,
          detail: "Precios vía búsqueda web (OpenAI)",
        });
        return;
      }

      const actionLabel =
        MENU_CATEGORIES.find((c) => c.id === categoryId)?.actions.find((a) => a.id === actionId)
          ?.label ?? "Resultado";

      setResult({
        title: actionLabel,
        content,
        detail: usedImageFallback ? "Procesado con Gemini (imagen)" : undefined,
      });
    } catch (error) {
      setResult({
        title: "Error",
        content: String(error),
      });
    } finally {
      setLoadingAction(null);
    }
  };

  const activeCategoryData = MENU_CATEGORIES.find(
    (category) => category.id === activeCategory,
  );

  return (
    <>
      <div
        ref={menuRef}
        className={`pointer-events-auto fixed z-50 w-[min(calc(100vw-24px),560px)] ${isVisible ? "animate-menu-reveal" : "invisible"}`}
        style={{
          top: position?.y ?? 0,
          left: position?.x ?? 0,
        }}
        onMouseDown={(event) => {
          event.stopPropagation();
          void invoke("set_overlay_always_on_top", { enabled: true });
        }}
      >
        {result && (
          <ResultBadge
            ref={resultPanelRef}
            title={result.title}
            content={result.content}
            detail={result.detail}
            shopListings={result.shopListings}
            copied={resultCopied}
            onCopy={() => {
              const copyText = result.shopListings?.length
                ? [
                    result.content,
                    ...result.shopListings.map(
                      (listing) =>
                        `${listing.storeName}: ${listing.price} · ${listing.url}${
                          listing.isSearchFallback ? " (búsqueda)" : ""
                        }`,
                    ),
                  ].join("\n")
                : result.content;
              void handleCopy(copyText).then(() => setResultCopied(true));
            }}
          />
        )}

        <div className="relative overflow-hidden rounded-2xl border border-violet-400/20 bg-slate-950/95 shadow-[0_16px_48px_rgba(0,0,0,0.5)]">
          <div
            role="button"
            tabIndex={0}
            aria-label="Arrastrar menú"
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
            className={`relative flex items-center justify-center gap-1.5 border-b border-white/10 py-1.5 pr-9 text-[10px] tracking-wide text-slate-500 touch-none select-none ${
              isDragging ? "cursor-grabbing bg-violet-500/10 text-violet-200" : "cursor-grab hover:bg-white/5 hover:text-slate-300"
            }`}
          >
            <span aria-hidden className="text-xs leading-none">
              ⋮⋮
            </span>
            <span>Arrastra para mover el menú</span>
            <button
              type="button"
              aria-label="Cerrar"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={onClose}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-slate-800/90 text-xs text-slate-300 transition hover:border-violet-400/40 hover:bg-slate-700 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="flex items-center gap-1 border-b border-white/10 px-2 py-2">
            {MENU_CATEGORIES.map((category) => {
              const isActive = activeCategory === category.id;
              const showSpinner = category.id === "text" && ocrLoading;
              const dimmed = isCategoryDimmed(category.id);

              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setActiveCategory(category.id)}
                  disabled={dimmed}
                  className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1.5 py-2 text-[11px] font-medium transition-all duration-200 ${
                    dimmed
                      ? "cursor-not-allowed opacity-40"
                      : isActive
                        ? "bg-violet-500/20 text-violet-100 shadow-[inset_0_0_0_1px_rgba(167,139,250,0.4)]"
                        : "text-slate-300 hover:bg-white/8 hover:text-white"
                  }`}
                >
                  <span className="relative text-base leading-none">
                    {category.icon}
                    {showSpinner && (
                      <span className="absolute -right-1.5 -top-1 inline-block h-2.5 w-2.5 animate-spin rounded-full border border-violet-300/30 border-t-violet-300" />
                    )}
                  </span>
                  <span className="truncate">{category.label}</span>
                </button>
              );
            })}
          </div>

          <div className="px-3 py-3">
            {captureError && (
              <div
                role="alert"
                className="mb-3 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-3 text-sm text-red-100"
              >
                <p className="font-medium text-red-200">Error de captura</p>
                <p className="mt-1 whitespace-pre-wrap">{captureError}</p>
              </div>
            )}

            {activeCategoryData && (
              <div className="animate-submenu-reveal space-y-2">
                {(activeCategoryData.id === "text" || activeCategoryData.id === "data") &&
                  !captureError && (
                  <div className="rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-xs text-slate-200">
                    {ocrLoading ? (
                      <p className="flex items-center gap-2 text-slate-400">
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-violet-300/30 border-t-violet-300" />
                        Leyendo texto con Apple Vision…
                      </p>
                    ) : ocrPreview ? (
                      <>
                        <p className="mb-1 font-medium text-violet-200">Texto detectado</p>
                        <p className="line-clamp-3 whitespace-pre-wrap">{ocrPreview}</p>
                        {activeCategoryData.id === "data" && analysis.hasNumbers && (
                          <p className="mt-1 text-slate-400">
                            Números: {analysis.numbers.join(", ")}
                          </p>
                        )}
                      </>
                    ) : hasCapturedImage ? (
                      <p className="text-slate-400">
                        {activeCategoryData.id === "data"
                          ? "No se detectaron números localmente. Las operaciones usarán Gemini para leer la imagen."
                          : "No se detectó texto localmente. Visión IA, Shop, Datos y acciones de Texto pueden usar Gemini con la imagen capturada."}
                      </p>
                    ) : (
                      <p className="text-slate-400">Capturando imagen…</p>
                    )}
                  </div>
                )}

                {activeCategoryData.id === "text" && (
                  <div className="rounded-xl border border-violet-400/15 bg-violet-500/5 px-3 py-2">
                    <TranslateLanguageSelector
                      compact
                      value={targetLanguage}
                      onChange={handleTargetLanguageChange}
                    />
                    <p className="mt-1 text-[10px] text-slate-500">
                      El idioma de entrada se detecta automáticamente.
                    </p>
                  </div>
                )}

                <div className="grid gap-1.5 sm:grid-cols-2">
                  {activeCategoryData.actions.map((action) => {
                    const disabled = isActionDisabled(activeCategoryData.id, action.id);
                    const highlighted = isActionHighlighted(activeCategoryData.id, action.id);
                    const isLoading =
                      loadingAction?.categoryId === activeCategoryData.id &&
                      loadingAction.actionId === action.id;

                    return (
                      <button
                        key={action.id}
                        type="button"
                        disabled={disabled || isLoading}
                        onClick={() => void handleAction(activeCategoryData.id, action.id)}
                        className={`relative rounded-xl border px-3 py-2 text-left text-sm transition ${
                          disabled
                            ? "cursor-not-allowed opacity-40 border-white/5 bg-white/[0.02] text-slate-500"
                            : highlighted
                              ? "border-violet-400/60 bg-violet-500/15 text-violet-50 shadow-[0_0_12px_rgba(139,92,246,0.25)]"
                              : "border-white/10 bg-white/[0.04] text-slate-100 hover:border-violet-400/40 hover:bg-violet-500/10"
                        }`}
                      >
                        <span className="flex items-center gap-2 font-medium">
                          {isLoading && (
                            <span className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-violet-300/30 border-t-violet-300" />
                          )}
                          {renderActionIcon(action.id)}
                          {action.label}
                        </span>
                        {action.description && (
                          <span className="mt-0.5 block text-xs text-slate-400">
                            {action.description}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <CopyToast message={toast} />
    </>
  );
}
