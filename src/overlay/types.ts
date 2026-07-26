export interface OverlayContext {
  monitor_x: number;
  monitor_y: number;
  scale_factor: number;
  width: number;
  height: number;
}

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureResult {
  x: number;
  y: number;
  width: number;
  height: number;
  image_base64: string;
  pixel_width?: number;
  pixel_height?: number;
}

export interface ProcessCaptureResult {
  capture: CaptureResult;
  ocr_text: string;
  ocr_lines: string[];
  ocr_confidence: number;
}

export type OverlayPhase = "idle" | "selecting" | "menu";

export type MenuCategoryId = "text" | "data" | "vision" | "shop" | "events";

export interface MenuAction {
  id: string;
  label: string;
  description?: string;
}

export interface MenuCategory {
  id: MenuCategoryId;
  icon: string;
  label: string;
  actions: MenuAction[];
}
