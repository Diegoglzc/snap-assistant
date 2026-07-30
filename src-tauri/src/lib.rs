mod capture;
mod ocr;

use base64::{engine::general_purpose::STANDARD, Engine};
use capture::{crop_region, capture_monitor, snapshot_base64, CaptureRegion, CaptureResult, MonitorCapture};
use ocr::OcrResult;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

struct CaptureBufferState(Mutex<Option<MonitorCapture>>);

#[derive(Clone, serde::Serialize)]
struct OverlayContext {
    monitor_x: i32,
    monitor_y: i32,
    scale_factor: f64,
    width: u32,
    height: u32,
    snapshot_base64: String,
    snapshot_width: u32,
    snapshot_height: u32,
}

#[derive(serde::Serialize, Clone)]
pub struct OcrResponse {
    pub text: String,
    pub lines: Vec<String>,
    pub confidence: f32,
}

#[derive(serde::Serialize, Clone)]
pub struct ProcessCaptureResult {
    pub capture: CaptureResult,
    pub ocr_text: String,
    pub ocr_lines: Vec<String>,
    pub ocr_confidence: f32,
}

fn show_capture_overlay(app: &AppHandle) -> Result<(), String> {
    let overlay = app
        .get_webview_window("overlay")
        .ok_or("Overlay window not found")?;

    let cursor = overlay.cursor_position().map_err(|e| e.to_string())?;
    let monitors = overlay.available_monitors().map_err(|e| e.to_string())?;

    let monitor = monitors
        .iter()
        .find(|m| {
            let pos = m.position();
            let size = m.size();
            cursor.x >= pos.x as f64
                && cursor.x < pos.x as f64 + size.width as f64
                && cursor.y >= pos.y as f64
                && cursor.y < pos.y as f64 + size.height as f64
        })
        .or_else(|| monitors.first())
        .ok_or("No monitor found")?;

    let pos = monitor.position();
    let size = monitor.size();
    let scale_factor = monitor.scale_factor();

    let monitor_capture = capture_monitor(pos.x, pos.y, scale_factor)?;
    let snapshot_base64 = snapshot_base64(&monitor_capture)?;

    {
        let state = app.state::<CaptureBufferState>();
        *state.0.lock().map_err(|e| e.to_string())? = Some(monitor_capture.clone());
    }

    overlay
        .set_position(PhysicalPosition::new(pos.x, pos.y))
        .map_err(|e| e.to_string())?;
    overlay
        .set_size(PhysicalSize::new(size.width, size.height))
        .map_err(|e| e.to_string())?;
    overlay.show().map_err(|e| e.to_string())?;
    overlay.set_focus().map_err(|e| e.to_string())?;

    let context = OverlayContext {
        monitor_x: pos.x,
        monitor_y: pos.y,
        scale_factor,
        width: size.width,
        height: size.height,
        snapshot_base64,
        snapshot_width: monitor_capture.image.width(),
        snapshot_height: monitor_capture.image.height(),
    };

    overlay
        .emit("overlay-show", context)
        .map_err(|e| e.to_string())?;

    Ok(())
}

fn hide_capture_overlay(app: &AppHandle) -> Result<(), String> {
    if let Some(overlay) = app.get_webview_window("overlay") {
        overlay.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn clear_capture_buffer(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<CaptureBufferState>();
    *state.0.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

fn crop_from_buffer(
    app: &AppHandle,
    region: CaptureRegion,
    scale_factor: f64,
) -> Result<CaptureResult, String> {
    let state = app.state::<CaptureBufferState>();
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let buffer = guard
        .as_ref()
        .ok_or_else(|| "No hay captura en memoria. Reinicia la selección.".to_string())?;

    crop_region(buffer, &region, scale_factor)
}

#[tauri::command]
fn start_capture_overlay(app: AppHandle) -> Result<(), String> {
    show_capture_overlay(&app)
}

#[tauri::command]
fn capture_selection(
    app: AppHandle,
    region: CaptureRegion,
    scale_factor: f64,
) -> Result<CaptureResult, String> {
    crop_from_buffer(&app, region, scale_factor)
}

#[tauri::command]
fn run_ocr_on_image(image_base64: String) -> Result<OcrResponse, String> {
    let png_bytes = STANDARD
        .decode(image_base64)
        .map_err(|e| format!("Invalid image data: {e}"))?;

    let OcrResult {
        text,
        lines,
        confidence,
    } = ocr::recognize_text_from_png(&png_bytes)?;

    Ok(OcrResponse {
        text,
        lines,
        confidence,
    })
}

#[tauri::command]
fn process_capture(
    app: AppHandle,
    region: CaptureRegion,
    scale_factor: f64,
) -> Result<ProcessCaptureResult, String> {
    let capture = crop_from_buffer(&app, region, scale_factor)?;
    let ocr = run_ocr_on_image(capture.image_base64.clone())?;

    let result = ProcessCaptureResult {
        capture,
        ocr_text: ocr.text,
        ocr_lines: ocr.lines,
        ocr_confidence: ocr.confidence,
    };

    app.emit("capture-complete", &result)
        .map_err(|e| e.to_string())?;

    Ok(result)
}

#[tauri::command]
fn finish_capture(
    app: AppHandle,
    region: CaptureRegion,
    scale_factor: f64,
) -> Result<ProcessCaptureResult, String> {
    let result = process_capture(app.clone(), region, scale_factor)?;
    hide_capture_overlay(&app)?;
    clear_capture_buffer(&app)?;
    Ok(result)
}

#[tauri::command]
fn cancel_capture(app: AppHandle) -> Result<(), String> {
    clear_capture_buffer(&app)?;
    hide_capture_overlay(&app)
}

fn load_env() {
    let _ = dotenvy::dotenv();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    load_env();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(CaptureBufferState(Mutex::new(None)))
        .setup(|app| {
            #[cfg(desktop)]
            {
                let shortcuts = [
                    Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Digit4),
                    Shortcut::new(Some(Modifiers::SUPER | Modifiers::ALT), Code::KeyS),
                ];

                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(|app, _shortcut, event| {
                            if event.state == ShortcutState::Pressed {
                                let _ = show_capture_overlay(app);
                            }
                        })
                        .build(),
                )?;

                app.global_shortcut()
                    .register_multiple(shortcuts)
                    .map_err(|e| e.to_string())?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_capture_overlay,
            capture_selection,
            run_ocr_on_image,
            process_capture,
            finish_capture,
            cancel_capture
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
