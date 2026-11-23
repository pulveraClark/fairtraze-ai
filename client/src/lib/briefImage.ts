// Client-side prep for project-brief images: downscale to max 1600px wide and re-encode.
// Re-encoding through a canvas drops EXIF (including GPS location) from the original file.
import { encodeUnderLimit } from "./avatarImage";

export const BRIEF_IMAGE_MAX_WIDTH = 1600;
// Server cap is 1 MiB; stay a little under so the multipart-free raw body always fits.
export const BRIEF_IMAGE_TARGET_BYTES = 1000 * 1024;
export const BRIEF_IMAGE_SOURCE_MAX_BYTES = 15 * 1024 * 1024;
export const BRIEF_PDF_MAX_BYTES = 5 * 1024 * 1024;
export const BRIEF_MAX_IMAGES = 5;
export const BRIEF_DESCRIPTION_MAX = 5000;
const SOURCE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function isAcceptedBriefImage(file: { type: string; size: number }): string | null {
  if (!SOURCE_TYPES.includes(file.type)) return "Choose a JPG, PNG or WebP image.";
  if (file.size > BRIEF_IMAGE_SOURCE_MAX_BYTES) return "That image is too large (max 15 MB).";
  return null;
}

export function isAcceptedBriefPdf(file: { type: string; size: number }): string | null {
  if (file.type !== "application/pdf") return "Choose a PDF file.";
  if (file.size > BRIEF_PDF_MAX_BYTES) return "That PDF is too large (max 5 MB).";
  return null;
}

/** Target size keeping aspect ratio; never upscales. */
export function briefImageSize(w: number, h: number): { width: number; height: number } {
  if (w <= BRIEF_IMAGE_MAX_WIDTH) return { width: w, height: h };
  const scale = BRIEF_IMAGE_MAX_WIDTH / w;
  return { width: BRIEF_IMAGE_MAX_WIDTH, height: Math.max(1, Math.round(h * scale)) };
}

export async function prepareBriefImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = briefImageSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process this image.");
    ctx.fillStyle = "#ffffff"; // flatten transparency so the JPEG fallback has no black background
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await encodeUnderLimit(
      (mime, q) => new Promise((resolve) => canvas.toBlob(resolve, mime, q)),
      BRIEF_IMAGE_TARGET_BYTES
    );
    if (!blob) throw new Error("Could not shrink this image under 1 MB. Try a smaller image.");
    return blob;
  } finally {
    bitmap.close();
  }
}
