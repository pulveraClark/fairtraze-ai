// Content-sniffing for image inserts (DocumentEditor.tsx's handleImageFileChange) — checks the
// file's actual leading bytes, never its extension or declared MIME type, since either can be
// spoofed by simply renaming a file. Extracted from DocumentEditor.tsx so this pure check can be
// unit-tested in isolation (same pattern as commentAnchor.ts/authorshipHighlight.ts).
const IMAGE_MAGIC_CHECKS: ((b: Uint8Array) => boolean)[] = [
  (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47, // PNG
  (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,                   // JPEG
  (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&  // WebP ("RIFF"...."WEBP")
         b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
];

// `header` should be at least the file's first 12 bytes (the longest check, WebP, reads up to
// index 11). Shorter input simply can't match and correctly returns false.
export function isSupportedImageHeader(header: Uint8Array): boolean {
  return IMAGE_MAGIC_CHECKS.some((check) => check(header));
}
