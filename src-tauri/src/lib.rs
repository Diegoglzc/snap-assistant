mod capture;
mod monitor_picker;
mod ocr;

use base64::{engine::general_purpose::STANDARD, Engine};
use capture::{crop_region, capture_monitor, debug_log_xcap_monitors, snapshot_base64, CaptureRegion, CaptureResult, MonitorCapture};
use monitor_picker::{
    close_monitor_picker_windows, focus_picker_at_cursor, monitor_descriptor, show_monitor_picker,
    MonitorDescriptor, MonitorPickerState,
};
use ocr::OcrResult;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use std::str::FromStr;
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

const OVERLAY_WINDOW_LABEL: &str = "overlay";

fn close_capture_overlay(app: &AppHandle) -> Result<(), String> {
    if let Some(overlay) = app.get_webview_window(OVERLAY_WINDOW_LABEL) {
        overlay.close().map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn create_capture_overlay_window(
    app: &AppHandle,
    monitor_x: i32,
    monitor_y: i32,
    window_width: u32,
    window_height: u32,
) -> Result<tauri::WebviewWindow, String> {
    close_capture_overlay(app)?;

    WebviewWindowBuilder::new(
        app,
        OVERLAY_WINDOW_LABEL,
        WebviewUrl::App("overlay.html".into()),
    )
    .title("Capture Overlay")
    .transparent(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .position(monitor_x as f64, monitor_y as f64)
    .inner_size(window_width as f64, window_height as f64)
    .visible(false)
    .build()
    .map_err(|error| error.to_string())
}

async fn show_capture_overlay_for_monitor(
    app: AppHandle,
    monitor: MonitorDescriptor,
) -> Result<(), String> {
    let monitor_x = monitor.x;
    let monitor_y = monitor.y;
    let monitor_width = monitor.width;
    let monitor_height = monitor.height;
    let scale_factor = monitor.scale_factor;

    let window_width = (monitor_width as f64 / scale_factor) as u32;
    let window_height = (monitor_height as f64 / scale_factor) as u32;

    eprintln!(
        "=== Monitor debug: selected Tauri monitor x={monitor_x}, y={monitor_y}, width={monitor_width}, height={monitor_height}, scale={scale_factor}, window={window_width}x{window_height} ==="
    );

    let overlay = create_capture_overlay_window(
        &app,
        monitor_x,
        monitor_y,
        window_width,
        window_height,
    )?;

    let (monitor_capture, snapshot_base64) = tauri::async_runtime::spawn_blocking(move || {
        let monitor_capture = capture_monitor(
            monitor_x,
            monitor_y,
            monitor_width,
            monitor_height,
            scale_factor,
        )?;
        let snapshot_base64 = snapshot_base64(&monitor_capture)?;
        Ok::<_, String>((monitor_capture, snapshot_base64))
    })
    .await
    .map_err(|error| format!("Capture task failed: {error}"))??;

    {
        let state = app.state::<CaptureBufferState>();
        *state.0.lock().map_err(|error| error.to_string())? = Some(monitor_capture.clone());
    }

    let context = OverlayContext {
        monitor_x,
        monitor_y,
        scale_factor,
        width: monitor_width,
        height: monitor_height,
        snapshot_base64,
        snapshot_width: monitor_capture.image.width(),
        snapshot_height: monitor_capture.image.height(),
    };

    overlay.show().map_err(|error| error.to_string())?;
    overlay.set_focus().map_err(|error| error.to_string())?;
    overlay
        .emit("overlay-show", context)
        .map_err(|error| error.to_string())?;

    Ok(())
}

async fn begin_capture_flow(app: AppHandle) -> Result<(), String> {
    let _ = close_monitor_picker_windows(&app);
    let _ = close_capture_overlay(&app);
    let _ = clear_capture_buffer(&app);

    let anchor = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    let monitors = anchor.available_monitors().map_err(|error| error.to_string())?;

    eprintln!("=== Monitor debug: Tauri available_monitors() ===");
    for (index, monitor) in monitors.iter().enumerate() {
        let position = monitor.position();
        let size = monitor.size();
        eprintln!(
            "  [tauri #{index}] x={}, y={}, width={}, height={}, scale={}",
            position.x,
            position.y,
            size.width,
            size.height,
            monitor.scale_factor(),
        );
    }

    debug_log_xcap_monitors();

    let monitor = monitors
        .first()
        .ok_or("No monitor found")?;

    if monitors.len() <= 1 {
        return show_capture_overlay_for_monitor(app, monitor_descriptor(monitor, 0)).await;
    }

    let descriptors: Vec<MonitorDescriptor> = monitors
        .iter()
        .enumerate()
        .map(|(index, monitor)| monitor_descriptor(monitor, index))
        .collect();

    show_monitor_picker(&app, descriptors.clone())?;
    focus_picker_at_cursor(&app, &descriptors)?;

    Ok(())
}

async fn show_capture_overlay(app: AppHandle) -> Result<(), String> {
    begin_capture_flow(app).await
}

fn spawn_show_capture_overlay(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = show_capture_overlay(app).await {
            eprintln!("Failed to show capture overlay: {error}");
        }
    });
}

fn hide_capture_overlay(app: &AppHandle) -> Result<(), String> {
    close_capture_overlay(app)
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
    spawn_show_capture_overlay(app);
    Ok(())
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
async fn confirm_monitor_selection(app: AppHandle, monitor_index: usize) -> Result<(), String> {
    let monitor = {
        let state = app.state::<MonitorPickerState>();
        let monitors = state.monitors.lock().map_err(|error| error.to_string())?;
        monitors
            .get(monitor_index)
            .cloned()
            .ok_or_else(|| format!("Invalid monitor index: {monitor_index}"))?
    };

    close_monitor_picker_windows(&app)?;
    tokio::time::sleep(std::time::Duration::from_millis(120)).await;
    show_capture_overlay_for_monitor(app, monitor).await
}

#[tauri::command]
fn cancel_monitor_picker(app: AppHandle) -> Result<(), String> {
    close_monitor_picker_windows(&app)
}

#[tauri::command]
fn cancel_capture(app: AppHandle) -> Result<(), String> {
    clear_capture_buffer(&app)?;
    hide_capture_overlay(&app)
}

fn normalize_modifier(modifier: &str) -> Result<&'static str, String> {
    match modifier.to_ascii_lowercase().as_str() {
        "super" | "cmd" | "command" | "meta" => Ok("Super"),
        "shift" => Ok("Shift"),
        "alt" | "option" => Ok("Alt"),
        "control" | "ctrl" => Ok("Control"),
        _ => Err(format!("Unknown modifier: {modifier}")),
    }
}

fn build_shortcut_from_parts(modifiers: &[String], key: &str) -> Result<Shortcut, String> {
    let mut parts = Vec::with_capacity(modifiers.len() + 1);
    for modifier in modifiers {
        parts.push(normalize_modifier(modifier)?.to_string());
    }
    parts.push(key.to_string());

    let shortcut_str = parts.join("+");
    Shortcut::from_str(&shortcut_str)
        .map_err(|error| format!("Invalid shortcut '{shortcut_str}': {error}"))
}

#[tauri::command]
fn update_global_shortcut(
    app: AppHandle,
    modifiers: Vec<String>,
    key: String,
) -> Result<(), String> {
    if modifiers.is_empty() {
        return Err("At least one modifier is required".into());
    }

    let shortcut = build_shortcut_from_parts(&modifiers, &key)?;

    app.global_shortcut()
        .unregister_all()
        .map_err(|error| error.to_string())?;

    app.global_shortcut()
        .register(shortcut)
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn load_env() {
    let _ = dotenvy::dotenv();
}

fn show_main_window(app: &AppHandle) {
    let Some(main) = app.get_webview_window("main") else {
        return;
    };

    let _ = main.unminimize();
    let _ = main.show();
    let _ = main.set_focus();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    load_env();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }

            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .manage(CaptureBufferState(Mutex::new(None)))
        .manage(MonitorPickerState::new())
        .setup(|app| {
            #[cfg(desktop)]
            {
                let default_shortcut =
                    Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Digit4);

                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(|app, _shortcut, event| {
                            if event.state == ShortcutState::Pressed {
                                spawn_show_capture_overlay(app.clone());
                            }
                        })
                        .build(),
                )?;

                app.global_shortcut()
                    .register(default_shortcut)
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
            cancel_capture,
            confirm_monitor_selection,
            cancel_monitor_picker,
            update_global_shortcut
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            #[cfg(target_os = "macos")]
            if let RunEvent::Reopen { has_visible_windows: false, .. } = event {
                show_main_window(app_handle);
            }
        });
}
