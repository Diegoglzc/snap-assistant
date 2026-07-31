use base64::{engine::general_purpose::STANDARD, Engine};
use image::{imageops, ImageFormat, RgbaImage};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Cursor;
use xcap::Monitor;

const UNIFORM_COLOR_THRESHOLD: f64 = 0.95;
const UNIFORM_SAMPLE_STEP: u32 = 8;
pub const SCREEN_CAPTURE_PERMISSION_ERROR: &str = "No se pudo capturar la pantalla. Verifica que el permiso de Grabación de Pantalla esté activado para esta app en Ajustes del Sistema > Privacidad y Seguridad, y reinicia la aplicación.";

#[derive(Debug, Deserialize)]
pub struct CaptureRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    pub monitor_x: i32,
    pub monitor_y: i32,
}

#[derive(Debug, Serialize, Clone)]
pub struct CaptureResult {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    pub image_base64: String,
    pub pixel_width: u32,
    pub pixel_height: u32,
}

#[derive(Debug, Clone)]
pub struct MonitorCapture {
    pub image: RgbaImage,
    pub monitor_x: i32,
    pub monitor_y: i32,
    pub scale_factor: f64,
}

#[derive(Debug, Clone, Copy)]
pub struct MonitorBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

fn rect_overlap_area(
    target_x: i32,
    target_y: i32,
    target_width: u32,
    target_height: u32,
    candidate_x: i32,
    candidate_y: i32,
    candidate_width: u32,
    candidate_height: u32,
) -> i64 {
    let target_right = target_x as i64 + target_width as i64;
    let target_bottom = target_y as i64 + target_height as i64;
    let candidate_right = candidate_x as i64 + candidate_width as i64;
    let candidate_bottom = candidate_y as i64 + candidate_height as i64;

    let overlap_width = target_right.min(candidate_right) - target_x.max(candidate_x) as i64;
    let overlap_height = target_bottom.min(candidate_bottom) - target_y.max(candidate_y) as i64;

    overlap_width.max(0) * overlap_height.max(0)
}

pub fn debug_log_xcap_monitors() {
    match Monitor::all() {
        Ok(monitors) => {
            eprintln!("=== Monitor debug: xcap Monitor::all() ===");
            for (index, monitor) in monitors.iter().enumerate() {
                eprintln!(
                    "  [xcap #{index}] x={}, y={}, width={}, height={}",
                    monitor.x().unwrap_or(0),
                    monitor.y().unwrap_or(0),
                    monitor.width().unwrap_or(0),
                    monitor.height().unwrap_or(0),
                );
            }
        }
        Err(error) => {
            eprintln!("=== Monitor debug: xcap Monitor::all() failed: {error} ===");
        }
    }
}

fn find_monitor_by_bounds(bounds: MonitorBounds) -> Result<(Monitor, i64), String> {
    let monitors = Monitor::all().map_err(|e| e.to_string())?;

    let mut best_match: Option<(Monitor, i64)> = None;

    for monitor in monitors {
        let monitor_x = monitor.x().unwrap_or(0);
        let monitor_y = monitor.y().unwrap_or(0);
        let monitor_width = monitor.width().unwrap_or(0);
        let monitor_height = monitor.height().unwrap_or(0);

        let overlap = rect_overlap_area(
            bounds.x,
            bounds.y,
            bounds.width,
            bounds.height,
            monitor_x,
            monitor_y,
            monitor_width,
            monitor_height,
        );

        eprintln!(
            "  [xcap match] x={monitor_x}, y={monitor_y}, width={monitor_width}, height={monitor_height}, overlap={overlap}"
        );

        if best_match.as_ref().map_or(true, |( _, best_overlap)| overlap > *best_overlap) {
            best_match = Some((monitor, overlap));
        }
    }

    best_match.ok_or_else(|| "Monitor not found".to_string())
}

fn effective_scale(monitor: &Monitor, full_image: &RgbaImage, scale_factor: f64) -> f64 {
    let image_width = full_image.width().max(1) as f64;
    let monitor_width = monitor.width().unwrap_or(full_image.width()) as f64;

    if monitor_width > 0.0 {
        let derived = image_width / monitor_width;
        if derived > 1.0 {
            return derived.max(scale_factor.max(1.0));
        }
    }

    scale_factor.max(1.0)
}

fn is_mostly_uniform_color(image: &RgbaImage) -> bool {
    let (width, height) = image.dimensions();
    if width == 0 || height == 0 {
        return false;
    }

    let mut color_counts: HashMap<[u8; 3], u64> = HashMap::new();
    let mut sampled_pixels = 0u64;

    let mut y = 0;
    while y < height {
        let mut x = 0;
        while x < width {
            let pixel = image.get_pixel(x, y);
            *color_counts.entry([pixel[0], pixel[1], pixel[2]]).or_insert(0) += 1;
            sampled_pixels += 1;
            x += UNIFORM_SAMPLE_STEP;
        }
        y += UNIFORM_SAMPLE_STEP;
    }

    if sampled_pixels == 0 {
        return false;
    }

    let dominant_count = color_counts.values().copied().max().unwrap_or(0);
    (dominant_count as f64 / sampled_pixels as f64) >= UNIFORM_COLOR_THRESHOLD
}

fn encode_png_base64(image: &RgbaImage) -> Result<String, String> {
    let mut png_bytes = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
        .map_err(|e| format!("Failed to encode PNG: {e}"))?;

    Ok(STANDARD.encode(&png_bytes))
}

pub fn capture_monitor(
    monitor_x: i32,
    monitor_y: i32,
    monitor_width: u32,
    monitor_height: u32,
    scale_factor: f64,
) -> Result<MonitorCapture, String> {
    let match_width = (monitor_width as f64 / scale_factor) as u32;
    let match_height = (monitor_height as f64 / scale_factor) as u32;

    let overlap_bounds = MonitorBounds {
        x: monitor_x,
        y: monitor_y,
        width: match_width,
        height: match_height,
    };

    eprintln!(
        "=== Monitor debug: matching xcap monitor for Tauri bounds x={monitor_x}, y={monitor_y}, match_size={match_width}x{match_height} (physical {monitor_width}x{monitor_height}) ==="
    );

    let (monitor, overlap) = find_monitor_by_bounds(overlap_bounds)?;

    eprintln!(
        "=== Monitor debug: selected xcap monitor x={}, y={}, width={}, height={}, overlap={overlap} ===",
        monitor.x().unwrap_or(0),
        monitor.y().unwrap_or(0),
        monitor.width().unwrap_or(0),
        monitor.height().unwrap_or(0),
    );

    let full_image = monitor
        .capture_image()
        .map_err(|e| format!("Failed to capture monitor: {e}"))?;

    if is_mostly_uniform_color(&full_image) {
        return Err(SCREEN_CAPTURE_PERMISSION_ERROR.into());
    }

    let derived_scale = effective_scale(&monitor, &full_image, scale_factor);

    Ok(MonitorCapture {
        image: full_image,
        monitor_x,
        monitor_y,
        scale_factor: derived_scale,
    })
}

pub fn snapshot_base64(capture: &MonitorCapture) -> Result<String, String> {
    encode_png_base64(&capture.image)
}

pub fn crop_region(
    capture: &MonitorCapture,
    region: &CaptureRegion,
    scale_factor: f64,
) -> Result<CaptureResult, String> {
    if region.width == 0 || region.height == 0 {
        return Err("Selection dimensions must be greater than zero".into());
    }

    if region.monitor_x != capture.monitor_x || region.monitor_y != capture.monitor_y {
        return Err("Selection monitor does not match captured buffer".into());
    }

    let scale = scale_factor.max(capture.scale_factor);

    let mut x = (region.x as f64 * scale).round() as u32;
    let mut y = (region.y as f64 * scale).round() as u32;
    let mut width = (region.width as f64 * scale).round().max(1.0) as u32;
    let mut height = (region.height as f64 * scale).round().max(1.0) as u32;

    let image_width = capture.image.width();
    let image_height = capture.image.height();

    x = x.min(image_width.saturating_sub(1));
    y = y.min(image_height.saturating_sub(1));
    width = width.min(image_width.saturating_sub(x)).max(1);
    height = height.min(image_height.saturating_sub(y)).max(1);

    let cropped = imageops::crop_imm(&capture.image, x, y, width, height).to_image();
    let image_base64 = encode_png_base64(&cropped)?;

    Ok(CaptureResult {
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        image_base64,
        pixel_width: cropped.width(),
        pixel_height: cropped.height(),
    })
}
