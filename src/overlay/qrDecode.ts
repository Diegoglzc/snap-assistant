import jsQR from "jsqr";

function loadImageFromBase64Png(imageBase64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo cargar la imagen para QR"));
    image.src = `data:image/png;base64,${imageBase64}`;
  });
}

/**
 * Decodes a QR code from a PNG image provided as base64 (without data-URI prefix).
 * Returns the decoded payload string, or null if none was found.
 */
export async function decodeQrFromBase64Png(
  imageBase64: string,
): Promise<string | null> {
  try {
    const image = await loadImageFromBase64Png(imageBase64);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (width <= 0 || height <= 0) return null;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;

    context.drawImage(image, 0, 0);
    const imageData = context.getImageData(0, 0, width, height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth",
    });

    const payload = code?.data?.trim();
    return payload || null;
  } catch (error) {
    console.warn("QR decode failed:", error);
    return null;
  }
}

export function isQrUrl(payload: string): boolean {
  const trimmed = payload.trim();
  if (/^https?:\/\//i.test(trimmed)) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
