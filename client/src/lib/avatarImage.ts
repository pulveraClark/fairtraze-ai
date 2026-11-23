// Client-side profile-photo preparation: center-crop to a square, resize to 256x256 and re-encode.
// Re-encoding through a canvas drops EXIF (including GPS location) from the original file.

export const AVATAR_SIZE = 256;
export const AVATAR_MAX_BYTES = 200 * 1024;
export const AVATAR_SOURCE_MAX_BYTES = 10 * 1024 * 1024;
const SOURCE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const QUALITIES = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];

export function isAcceptedAvatarSource(file: { type: string; size: number }): string | null {
  if (!SOURCE_TYPES.includes(file.type)) return "Choose a JPEG, PNG or WebP image.";
  if (file.size > AVATAR_SOURCE_MAX_BYTES) return "That image is too large (max 10 MB).";
  return null;
}

/** Largest centered square inside w x h. */
export function squareCrop(w: number, h: number): { sx: number; sy: number; side: number } {
  const side = Math.min(w, h);
  return { sx: Math.floor((w - side) / 2), sy: Math.floor((h - side) / 2), side };
}

type Encoder = (mime: string, quality: number) => Promise<Blob | null>;

/** Tries WebP then JPEG, stepping quality down until the blob fits within maxBytes. */
export async function encodeUnderLimit(encode: Encoder, maxBytes = AVATAR_MAX_BYTES): Promise<Blob | null> {
  for (const mime of ["image/webp", "image/jpeg"]) {
    for (const q of QUALITIES) {
      const blob = await encode(mime, q);
      if (!blob || blob.type !== mime) break; // browser does not support this encoder
      if (blob.size <= maxBytes) return blob;
    }
  }
  return null;
}

export async function prepareAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const { sx, sy, side } = squareCrop(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process this image.");
    ctx.fillStyle = "#ffffff"; // flatten transparency so the JPEG fallback has no black background
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    const blob = await encodeUnderLimit((mime, q) => new Promise((resolve) => canvas.toBlob(resolve, mime, q)));
    if (!blob) throw new Error("Could not shrink this image under 200 KB. Try a different photo.");
    return blob;
  } finally {
    bitmap.close();
  }
}
