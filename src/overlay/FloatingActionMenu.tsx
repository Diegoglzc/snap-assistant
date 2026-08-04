import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Code, Contact, Eye, QrCode, Volume2 } from "lucide-react";
import { classifyCaptureCategories, MENU_CATEGORIES } from "./categories";
import { copyToClipboard } from "./clipboard";
import {
  geminiExplainError,
  geminiExtractCalendarEvent,
  geminiExtractContact,
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
import { isQrUrl } from "./qrDecode";
import ResultBadge, { CopyToast } from "./ResultBadge";
import TranslateLanguageSelector from "./TranslateLanguageSelector";
import UnitConversionPanel from "./UnitConversionPanel";
import {
  convertMeasurement,
  defaultTargetUnit,
  detectMeasurement,
  formatConvertedValue,
  hasConvertibleUnits,
} from "./unitConversion";
import {
  buildVCard,
  downloadVcfFile,
  extractContactHeuristics,
  hasContactPattern,
} from "./vcard";
import { isSpeaking, speakText, stopSpeaking } from "./speech";
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
  qrContent: string | null;
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
  qrContent,
  onClose,
}: FloatingActionMenuProps) {
  const [activeCategory, setActiveCategory] = useState<MenuCategoryId>("text");
  const [loadingAction, setLoadingAction] = useState<ActionLoading | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [toast, setToast] = useState("");
  const [resultCopied, setResultCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState<TargetLanguageCode>(
    getDefaultTargetLanguage,
  );
  const toastTimer = useRef<number | null>(null);
  const resultPanelRef = useRef<HTMLDivElement>(null);
  const guardrailsApplied = useRef(false);

  const ocrPreview = session?.ocr_text?.trim() ?? "";
  const analysis = useMemo(() => analyzeOcrText(ocrPreview), [ocrPreview]);
  const imageBase64 = session?.capture.image_base64 ?? "";
  const hasCapturedImage = !!imageBase64;
  const categoryAvailability = useMemo(
    () => classifyCaptureCategories(ocrPreview, hasCapturedImage),
    [ocrPreview, hasCapturedImage],
  );
  const hasText = analysis.hasText;
  const hasConvertible = useMemo(
    () => hasConvertibleUnits(ocrPreview),
    [ocrPreview],
  );
  const hasContact = useMemo(() => hasContactPattern(ocrPreview), [ocrPreview]);

  const layoutKey = `${activeCategory}:${ocrLoading ? "loading" : "ready"}:${result ? "result" : "none"}:${qrContent ? "qr" : "noqr"}:${hasConvertible ? "units" : "nounits"}`;
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
    setSpeaking(false);
    stopSpeaking();
    setTargetLanguage(getDefaultTargetLanguage());
  }, [selection]);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

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

    if (categoryId === "text" && actionId === "read-aloud") {
      return ocrLoading || !hasText;
    }

    if (categoryId === "text" && TEXT_GEMINI_ACTIONS.has(actionId)) {
      return !hasText && !hasCapturedImage;
    }

    if (categoryId === "text" && actionId === "save-contact") {
      return !hasText && !hasCapturedImage;
    }

    if (categoryId === "data" && actionId === "convert-units") {
      return !hasConvertible;
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

    if (categoryId === "data" && actionId === "convert-units" && hasConvertible) {
      return true;
    }

    if (categoryId === "text" && actionId === "save-contact" && hasContact) {
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
    if (actionId === "save-contact") {
      return <Contact className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />;
    }
    if (actionId === "read-aloud") {
      return <Volume2 className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />;
    }
    return null;
  }

  const isCategoryDimmed = useCallback(
    (categoryId: MenuCategoryId) => {
      if (captureError) return categoryId !== "text";

      if (categoryId === "data") {
        return !analysis.hasNumbers && !hasCapturedImage && !hasConvertible;
      }

      return !categoryAvailability[categoryId];
    },
    [
      analysis.hasNumbers,
      captureError,
      categoryAvailability,
      hasCapturedImage,
      hasConvertible,
    ],
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

    if (actionId !== "read-aloud" && (speaking || isSpeaking())) {
      stopSpeaking();
      setSpeaking(false);
    }

    setResult(null);
    setResultCopied(false);

    if (categoryId === "text" && actionId === "copy") {
      await handleCopy(ocrPreview);
      return;
    }

    if (categoryId === "text" && actionId === "read-aloud") {
      if (speaking || isSpeaking()) {
        stopSpeaking();
        setSpeaking(false);
        setResult({
          title: "Lectura",
          content: "Lectura detenida.",
        });
        return;
      }

      try {
        const detected = speakText(ocrPreview, {
          onEnd: () => setSpeaking(false),
          onError: (error) => {
            setSpeaking(false);
            setResult({
              title: "Error",
              content: error,
            });
          },
        });
        setSpeaking(true);
        setResult({
          title: "Leyendo en voz alta",
          content:
            ocrPreview.length > 220
              ? `${ocrPreview.slice(0, 220)}…`
              : ocrPreview,
          detail: `Idioma detectado: ${detected.label} · Pulsa de nuevo para detener`,
        });
      } catch (error) {
        setSpeaking(false);
        setResult({
          title: "Error",
          content: String(error),
        });
      }
      return;
    }

    if (categoryId === "data" && actionId === "convert-units") {
      const measurement = detectMeasurement(ocrPreview);
      if (!measurement) {
        setResult({
          title: "Sin unidades",
          content: "No se detectó un patrón de número + unidad convertible.",
        });
        return;
      }

      const target = defaultTargetUnit(measurement);
      const converted = convertMeasurement(measurement, target);
      if (!converted) return;

      setResult({
        title: "Conversión rápida",
        content: `${measurement.value} ${measurement.displayUnit} → ${formatConvertedValue(converted.value, measurement.family)} ${converted.label}`,
        detail: converted.approximate
          ? "Tipo de cambio aproximado · Usa el selector en Datos para cambiar la unidad destino"
          : "Usa el selector en Datos para cambiar la unidad destino",
      });
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

    if (categoryId === "text" && actionId === "save-contact") {
      setLoadingAction({ categoryId, actionId });

      try {
        const heuristics = extractContactHeuristics(ocrPreview);
        let extracted;
        try {
          extracted = await geminiExtractContact(
            ocrPreview,
            hasCapturedImage ? imageBase64 : undefined,
          );
        } catch (aiError) {
          if (!heuristics.phone && !heuristics.email && !heuristics.fullName) {
            throw aiError;
          }
          extracted = {
            fullName: heuristics.fullName ?? "Contacto",
            phone: heuristics.phone,
            email: heuristics.email,
            organization: heuristics.organization,
          };
        }

        const details = {
          fullName: extracted.fullName || heuristics.fullName || "Contacto",
          phone: extracted.phone || heuristics.phone,
          email: extracted.email || heuristics.email,
          organization: extracted.organization || heuristics.organization,
          title: extracted.title,
          note: ocrPreview.slice(0, 500) || undefined,
        };

        if (!details.phone && !details.email && !details.organization) {
          setResult({
            title: "Sin contacto",
            content: "No se detectaron teléfono, correo ni empresa en la captura.",
          });
          return;
        }

        const vcf = buildVCard(details);
        downloadVcfFile(vcf, details.fullName);

        const lines = [
          details.fullName,
          details.title,
          details.organization,
          details.phone,
          details.email,
        ].filter(Boolean);

        setResult({
          title: "Contacto",
          content: lines.join("\n"),
          detail: "Archivo .vcf descargado — ábrelo para guardar en Contactos",
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

          {qrContent && (
            <div className="border-b border-emerald-400/25 bg-emerald-500/10 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-200">
                  <QrCode className="h-3.5 w-3.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">
                    QR detectado
                  </p>
                  <p className="mt-0.5 line-clamp-2 break-all text-xs text-slate-200">
                    {qrContent}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {isQrUrl(qrContent) ? (
                      <button
                        type="button"
                        onClick={() =>
                          void invoke("open_external_url", { url: qrContent.trim() })
                        }
                        className="rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-50 transition hover:border-emerald-300/60 hover:bg-emerald-500/25"
                      >
                        Abrir enlace
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleCopy(qrContent)}
                        className="rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-50 transition hover:border-emerald-300/60 hover:bg-emerald-500/25"
                      >
                        Copiar contenido
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

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

                {activeCategoryData.id === "data" && hasConvertible && (
                  <UnitConversionPanel text={ocrPreview} />
                )}

                <div className="grid gap-1.5 sm:grid-cols-2">
                  {activeCategoryData.actions.map((action) => {
                    const disabled = isActionDisabled(activeCategoryData.id, action.id);
                    const highlighted =
                      isActionHighlighted(activeCategoryData.id, action.id) ||
                      (action.id === "read-aloud" && speaking);
                    const isLoading =
                      loadingAction?.categoryId === activeCategoryData.id &&
                      loadingAction.actionId === action.id;
                    const label =
                      action.id === "read-aloud" && speaking
                        ? "Detener lectura"
                        : action.label;

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
                          {label}
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
