use std::sync::Mutex;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

#[derive(Clone, serde::Serialize)]
pub struct MonitorDescriptor {
    pub index: usize,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

pub struct MonitorPickerState {
    pub monitors: Mutex<Vec<MonitorDescriptor>>,
}

impl MonitorPickerState {
    pub fn new() -> Self {
        Self {
            monitors: Mutex::new(Vec::new()),
        }
    }
}

pub fn monitor_descriptor(monitor: &tauri::Monitor, index: usize) -> MonitorDescriptor {
    let position = monitor.position();
    let size = monitor.size();

    MonitorDescriptor {
        index,
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        scale_factor: monitor.scale_factor(),
    }
}

pub fn close_monitor_picker_windows(app: &AppHandle) -> Result<(), String> {
    let labels: Vec<String> = app
        .webview_windows()
        .into_keys()
        .filter(|label| label.starts_with("monitor-picker-"))
        .collect();

    for label in labels {
        if let Some(window) = app.get_webview_window(&label) {
            window.close().map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

fn picker_label(index: usize) -> String {
    format!("monitor-picker-{index}")
}

fn create_picker_window(app: &AppHandle, monitor: &MonitorDescriptor, total: usize) -> Result<(), String> {
    let label = picker_label(monitor.index);

    if let Some(existing) = app.get_webview_window(&label) {
        existing.close().map_err(|error| error.to_string())?;
    }

    let url = format!(
        "monitor-picker.html?index={}&total={}",
        monitor.index, total
    );

    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
        .title("Seleccionar pantalla")
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .build()
        .map_err(|error| error.to_string())?;

    window
        .set_position(PhysicalPosition::new(monitor.x, monitor.y))
        .map_err(|error| error.to_string())?;
    window
        .set_size(PhysicalSize::new(monitor.width, monitor.height))
        .map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;

    Ok(())
}

pub fn show_monitor_picker(app: &AppHandle, monitors: Vec<MonitorDescriptor>) -> Result<(), String> {
    close_monitor_picker_windows(app)?;

    let total = monitors.len();
    {
        let state = app.state::<MonitorPickerState>();
        *state.monitors.lock().map_err(|error| error.to_string())? = monitors.clone();
    }

    for monitor in &monitors {
        create_picker_window(app, monitor, total)?;
    }

    Ok(())
}

pub fn focus_picker_at_cursor(app: &AppHandle, monitors: &[MonitorDescriptor]) -> Result<(), String> {
    let anchor = app
        .get_webview_window("overlay")
        .or_else(|| app.get_webview_window("main"))
        .ok_or("No anchor window found")?;

    let cursor = anchor.cursor_position().map_err(|error| error.to_string())?;
    let focus_index = monitors
        .iter()
        .position(|monitor| {
            cursor.x >= monitor.x as f64
                && cursor.x < monitor.x as f64 + monitor.width as f64
                && cursor.y >= monitor.y as f64
                && cursor.y < monitor.y as f64 + monitor.height as f64
        })
        .unwrap_or(0);

    if let Some(window) = app.get_webview_window(&picker_label(focus_index)) {
        window.set_focus().map_err(|error| error.to_string())?;
    }

    Ok(())
}
