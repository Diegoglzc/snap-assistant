import type { SelectionRect } from "./types";

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

const VIEWPORT_PADDING = 12;
const SELECTION_GAP = 12;
const RESULT_PANEL_GAP = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getViewportSize(): Size {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

export function clampMenuPosition(
  position: Point,
  menuSize: Size,
  viewport: Size = getViewportSize(),
): Point {
  const maxX = Math.max(
    VIEWPORT_PADDING,
    viewport.width - menuSize.width - VIEWPORT_PADDING,
  );
  const maxY = Math.max(
    VIEWPORT_PADDING,
    viewport.height - menuSize.height - VIEWPORT_PADDING,
  );

  return {
    x: clamp(position.x, VIEWPORT_PADDING, maxX),
    y: clamp(position.y, VIEWPORT_PADDING, maxY),
  };
}

export function computeInitialMenuPosition(
  selection: SelectionRect,
  menuSize: Size,
  viewport: Size = getViewportSize(),
): Point {
  const selectionCenterX = selection.x + selection.width / 2;
  let x = selectionCenterX - menuSize.width / 2;
  let y = selection.y + selection.height + SELECTION_GAP;

  const fitsBelow = y + menuSize.height <= viewport.height - VIEWPORT_PADDING;
  const fitsAbove =
    selection.y - SELECTION_GAP - menuSize.height >= VIEWPORT_PADDING;

  if (!fitsBelow && fitsAbove) {
    y = selection.y - menuSize.height - SELECTION_GAP;
  } else if (!fitsBelow && !fitsAbove) {
    y = clamp(
      (viewport.height - menuSize.height) / 2,
      VIEWPORT_PADDING,
      viewport.height - menuSize.height - VIEWPORT_PADDING,
    );
  }

  return clampMenuPosition({ x, y }, menuSize, viewport);
}

export function adjustMenuPositionForResultPanel(
  position: Point,
  menuSize: Size,
  resultHeight: number,
  viewport: Size = getViewportSize(),
): Point {
  if (resultHeight <= 0) {
    return clampMenuPosition(position, menuSize, viewport);
  }

  const stackHeight = resultHeight + RESULT_PANEL_GAP + menuSize.height;
  const minStackTop = VIEWPORT_PADDING;
  const maxStackTop = Math.max(
    minStackTop,
    viewport.height - VIEWPORT_PADDING - stackHeight,
  );

  let stackTop = position.y - RESULT_PANEL_GAP - resultHeight;

  if (stackTop < minStackTop) {
    stackTop = minStackTop;
  } else if (stackTop > maxStackTop) {
    stackTop = maxStackTop;
  }

  const adjustedY = stackTop + resultHeight + RESULT_PANEL_GAP;

  return clampMenuPosition({ x: position.x, y: adjustedY }, menuSize, viewport);
}

export { VIEWPORT_PADDING };
