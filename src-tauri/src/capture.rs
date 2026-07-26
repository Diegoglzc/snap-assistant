use base64::{engine::general_purpose::STANDARD, Engine};
use image::{imageops, ImageFormat, RgbaImage};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use xcap::Monitor;

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

fn find_monitor(region: &CaptureRegion) -> Result<Monitor, String> {
    let monitors = Monitor::all().map_err(|e| e.to_string())?;

    monitors
        .into_iter()
        .find(|monitor| {
            monitor.x().unwrap_or(0) == region.monitor_x
                && monitor.y().unwrap_or(0) == region.monitor_y
        })
        .or_else(|| Monitor::all().ok()?.into_iter().next())
        .ok_or_else(|| "Monitor not found".to_string())
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

pub fn capture_region(region: &CaptureRegion, scale_factor: f64) -> Result<CaptureResult, String> {
    if region.width == 0 || region.height == 0 {
        return Err("Selection dimensions must be greater than zero".into());
    }

    let monitor = find_monitor(region)?;
    let full_image = monitor
        .capture_image()
        .map_err(|e| format!("Failed to capture monitor: {e}"))?;

    let scale = effective_scale(&monitor, &full_image, scale_factor);

    let mut x = (region.x as f64 * scale).round() as u32;
    let mut y = (region.y as f64 * scale).round() as u32;
    let mut width = (region.width as f64 * scale).round().max(1.0) as u32;
    let mut height = (region.height as f64 * scale).round().max(1.0) as u32;

    let image_width = full_image.width();
    let image_height = full_image.height();

    x = x.min(image_width.saturating_sub(1));
    y = y.min(image_height.saturating_sub(1));
    width = width.min(image_width.saturating_sub(x)).max(1);
    height = height.min(image_height.saturating_sub(y)).max(1);

    let cropped = imageops::crop_imm(&full_image, x, y, width, height).to_image();

    let mut png_bytes = Vec::new();
    cropped
        .write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
        .map_err(|e| format!("Failed to encode PNG: {e}"))?;

    Ok(CaptureResult {
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        image_base64: STANDARD.encode(&png_bytes),
        pixel_width: cropped.width(),
        pixel_height: cropped.height(),
    })
}
