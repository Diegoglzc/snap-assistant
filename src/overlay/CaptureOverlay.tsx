import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import FloatingActionMenu from "./FloatingActionMenu";
import SelectionFrame from "./SelectionFrame";
import type {
  CaptureResult,
  OverlayContext,
  OverlayPhase,
  ProcessCaptureResult,
  SelectionRect,
} from "./types";

const MIN_SELECTION_SIZE = 4;

function computeScaleFactor(overlayContext: OverlayContext): number {
  const logicalWidth = window.innerWidth;
  const logicalHeight = window.innerHeight;

  const scaleFromWidth =
    logicalWidth > 0 ? overlayContext.width / logicalWidth : overlayContext.scale_factor;
  const scaleFromHeight =
    logicalHeight > 0 ? overlayContext.height / logicalHeight : overlayContext.scale_factor;

  return Math.max(
    overlayContext.scale_factor,
    window.devicePixelRatio || 1,
    scaleFromWidth,
    scaleFromHeight,
  );
}

function normalizeRect(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): SelectionRect {
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);
  return { x, y, width, height };
}

export default function CaptureOverlay() {
  const [context, setContext] = useState<OverlayContext | null>(null);
  const [phase, setPhase] = useState<OverlayPhase>("idle");
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [lockedSelection, setLockedSelection] = useState<SelectionRect | null>(null);
  const [session, setSession] = useState<ProcessCaptureResult | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const startPoint = useRef<{ x: number; y: number } | null>(null);
  const ocrRunId = useRef(0);

  const resetState = useCallback(() => {
    setPhase("idle");
    setSelection(null);
    setLockedSelection(null);
    setSession(null);
    setOcrLoading(false);
    startPoint.current = null;
    ocrRunId.current += 1;
  }, []);

  const cancelCapture = useCallback(async () => {
    resetState();
    await invoke("cancel_capture");
  }, [resetState]);

  const runBackgroundCapture = useCallback(
    async (rect: SelectionRect, overlayContext: OverlayContext) => {
      const runId = ++ocrRunId.current;

      const region = {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        monitor_x: overlayContext.monitor_x,
        monitor_y: overlayContext.monitor_y,
      };

      try {
        const capture = await invoke<CaptureResult>("capture_selection", {
          region,
          scaleFactor: computeScaleFactor(overlayContext),
        });

        if (runId !== ocrRunId.current) return;

        setSession({
          capture,
          ocr_text: "",
          ocr_lines: [],
          ocr_confidence: 0,
        });

        let ocr = { text: "", lines: [] as string[], confidence: 0 };
        try {
          ocr = await invoke<{
            text: string;
            lines: string[];
            confidence: number;
          }>("run_ocr_on_image", {
            imageBase64: capture.image_base64,
          });
        } catch (ocrError) {
          console.warn("Local OCR failed; Gemini can still process the image:", ocrError);
        }

        if (runId !== ocrRunId.current) return;

        const result: ProcessCaptureResult = {
          capture,
          ocr_text: ocr.text,
          ocr_lines: ocr.lines,
          ocr_confidence: ocr.confidence,
        };

        setSession(result);
        setOcrLoading(false);
        await emit("capture-complete", result);
      } catch (error) {
        console.error("Capture/OCR failed:", error);
        if (runId === ocrRunId.current) {
          setOcrLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    const unlistenShow = listen<OverlayContext>("overlay-show", (event) => {
      setContext(event.payload);
      resetState();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void cancelCapture();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      void unlistenShow.then((unlisten) => unlisten());
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [cancelCapture, resetState]);

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (phase === "menu") return;

    const { clientX, clientY } = event;
    startPoint.current = { x: clientX, y: clientY };
    setPhase("selecting");
    setSelection({ x: clientX, y: clientY, width: 0, height: 0 });
    setLockedSelection(null);
    setSession(null);
    setOcrLoading(false);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (phase !== "selecting" || !startPoint.current) return;

    setSelection(
      normalizeRect(
        startPoint.current.x,
        startPoint.current.y,
        event.clientX,
        event.clientY,
      ),
    );
  };

  const handleMouseUp = (event: React.MouseEvent<HTMLDivElement>) => {
    if (phase !== "selecting" || !startPoint.current || !context) return;

    const rect = normalizeRect(
      startPoint.current.x,
      startPoint.current.y,
      event.clientX,
      event.clientY,
    );

    startPoint.current = null;

    if (rect.width < MIN_SELECTION_SIZE || rect.height < MIN_SELECTION_SIZE) {
      void cancelCapture();
      return;
    }

    setLockedSelection(rect);
    setSelection(null);
    setPhase("menu");
    setOcrLoading(true);
    setSession(null);

    void runBackgroundCapture(rect, context);
  };

  const activeSelection = lockedSelection ?? selection;
  const isInteractive = phase === "idle" || phase === "selecting";

  return (
    <div
      className={`fixed inset-0 ${isInteractive ? "pointer-events-auto cursor-crosshair" : "pointer-events-none"}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {phase === "idle" && (
        <div className="pointer-events-none fixed left-1/2 top-4 -translate-x-1/2 rounded-full border border-violet-300/25 bg-slate-900/90 px-4 py-2 text-sm text-slate-100 shadow-md">
          Arrastra para seleccionar · Esc para cancelar
        </div>
      )}

      {activeSelection && activeSelection.width > 0 && activeSelection.height > 0 && (
        <SelectionFrame rect={activeSelection} phase={phase} />
      )}

      {lockedSelection && phase === "menu" && (
        <FloatingActionMenu
          selection={lockedSelection}
          session={session}
          ocrLoading={ocrLoading}
          onClose={() => void cancelCapture()}
        />
      )}
    </div>
  );
}
