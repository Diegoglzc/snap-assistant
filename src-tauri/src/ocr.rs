use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct OcrResult {
    pub text: String,
    pub lines: Vec<String>,
    pub confidence: f32,
}

#[cfg(target_os = "macos")]
pub fn recognize_text_from_png(png_bytes: &[u8]) -> Result<OcrResult, String> {
    use apple_vision::recognize_text::{RecognitionLevel, TextRecognizer};
    use std::time::{SystemTime, UNIX_EPOCH};

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();

    let temp_path = std::env::temp_dir().join(format!("snap-assistant-ocr-{timestamp}.png"));
    std::fs::write(&temp_path, png_bytes).map_err(|e| format!("Failed to write temp OCR image: {e}"))?;

    let recognition = (|| {
        let recognizer = TextRecognizer::new()
            .with_recognition_level(RecognitionLevel::Accurate)
            .with_language_correction(true);

        recognizer
            .recognize_in_path(&temp_path)
            .map_err(|e| format!("Vision OCR failed: {e}"))
    })();

    let _ = std::fs::remove_file(&temp_path);

    let observations = recognition?;
    let lines: Vec<String> = observations.iter().map(|obs| obs.text.clone()).collect();
    let confidence = if observations.is_empty() {
        0.0
    } else {
        observations.iter().map(|obs| obs.confidence).sum::<f32>() / observations.len() as f32
    };

    Ok(OcrResult {
        text: lines.join("\n"),
        lines,
        confidence,
    })
}

#[cfg(not(target_os = "macos"))]
pub fn recognize_text_from_png(_png_bytes: &[u8]) -> Result<OcrResult, String> {
    Err("OCR is only available on macOS".into())
}
