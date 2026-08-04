import { invoke } from "@tauri-apps/api/core";

export interface CssRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Rounds a CSS rect for native window geometry. */
export function roundCssRect(rect: DOMRect | CssRect): CssRect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(1, Math.ceil(rect.width)),
    height: Math.max(1, Math.ceil(rect.height)),
  };
}

/**
 * Measures the visual bounds of the tools panel (and optional result badge),
 * then resizes/repositions the native overlay window to match.
 * Session/OCR state is untouched — only the OS window frame changes.
 */
export async function fitOverlayToPanelRect(rect: DOMRect | CssRect): Promise<void> {
  const rounded = roundCssRect(rect);
  if (rounded.width < 2 || rounded.height < 2) return;

  await invoke("fit_overlay_to_panel", { rect: rounded });
}

export async function startOverlayDragging(): Promise<void> {
  await invoke("start_overlay_dragging");
}

export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}
