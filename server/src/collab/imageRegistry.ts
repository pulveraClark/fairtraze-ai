import { createHash } from "node:crypto";
import type * as YTypes from "yjs";
import { prisma } from "../lib/prisma.js";
import { Y } from "./yjsCjs.js";
import type { PresentDocumentImage } from "@shared/imageCredit.js";

// Image registry for image credit. Plain counting: bytes, hash and header size only. Nothing here
// reads what an image shows, and nothing here writes to the Yjs document.

type XmlNode = YTypes.XmlFragment | YTypes.XmlElement | YTypes.XmlText;

// A src longer than this (characters of base64, roughly 4 MB of file) is never decoded: no registry
// row and so no credit. The client already caps files at 2 MB; this guards a modified client.
export const MAX_IMAGE_SRC_CHARS = 6 * 1024 * 1024;

export interface DecodedImage {
  contentHash: string;
  byteSize: number;
  width: number;
  height: number;
}

/** Every image `src` in document order (any nesting depth). Only reads attributes. */
export function collectImageSrcs(node: XmlNode, out: string[] = []): string[] {
  if (node instanceof Y.XmlText) return out;
  if (node instanceof Y.XmlElement && node.nodeName === "image") {
    const src = node.getAttribute("src");
    out.push(typeof src === "string" ? src : "");
  }
  for (const child of node.toArray()) collectImageSrcs(child as XmlNode, out);
  return out;
}

// Natural pixel size from the file header: PNG, JPEG and WebP (the three types the editor accepts).
export function imageDimensions(buf: Buffer): { width: number; height: number } | null {
  // PNG: 8-byte signature, then the IHDR chunk with big-endian width and height.
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.toString("ascii", 12, 16) === "IHDR") {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: walk the segments to the first start-of-frame marker.
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xff) { i++; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
    return null;
  }
  // WebP: RIFF....WEBP, then a lossy (VP8 ), lossless (VP8L) or extended (VP8X) chunk.
  if (buf.length >= 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const kind = buf.toString("ascii", 12, 16);
    if (kind === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (kind === "VP8L" && buf[20] === 0x2f) {
      const bits = buf.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (kind === "VP8X") {
      return { width: (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1, height: (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1 };
    }
  }
  return null;
}

const DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,/i;

/** Decodes an image src into hash + size. null when it is not a supported data URL, too large, or unreadable. */
export function decodeImageSrc(src: string): DecodedImage | null {
  if (typeof src !== "string" || src.length > MAX_IMAGE_SRC_CHARS) return null;
  const head = DATA_URL.exec(src);
  if (!head) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(src.slice(head[0].length), "base64");
  } catch {
    return null;
  }
  if (buf.length === 0) return null;
  // A file whose header cannot be read as PNG, JPEG or WebP is not registered, so it earns no credit.
  const dims = imageDimensions(buf);
  if (!dims) return null;
  return {
    contentHash: createHash("sha256").update(buf).digest("hex"),
    byteSize: buf.length,
    width: dims.width,
    height: dims.height,
  };
}

/** Per-room cache so an unchanged image is hashed once, not on every Yjs update. */
export class ImageDecodeCache {
  private readonly map = new Map<string, DecodedImage | null>();
  decode(src: string): DecodedImage | null {
    if (this.map.has(src)) return this.map.get(src) ?? null;
    if (this.map.size >= 8) this.map.clear();
    const d = decodeImageSrc(src);
    this.map.set(src, d);
    return d;
  }
}

/** Hashes of the images in the fragment right now (unreadable images are left out). */
export function currentImages(fragment: YTypes.XmlFragment, cache: ImageDecodeCache): Map<string, DecodedImage> {
  const out = new Map<string, DecodedImage>();
  for (const src of collectImageSrcs(fragment)) {
    const d = cache.decode(src);
    if (d && !out.has(d.contentHash)) out.set(d.contentHash, d);
  }
  return out;
}

export interface NewImageRecord extends DecodedImage {
  ownerUserId: number;
}

/**
 * Writes registry rows, insert-if-missing: an existing row (same document, same content) is never
 * changed, so the first inserter stays the owner across restarts, re-inserts and copies by others.
 * Never throws: a failure is logged without any image data and the images simply earn no credit.
 */
export async function writeImageRegistry(documentId: number, records: NewImageRecord[]): Promise<void> {
  if (records.length === 0) return;
  try {
    await prisma.documentImage.createMany({
      data: records.map((r) => ({
        documentId,
        contentHash: r.contentHash,
        ownerUserId: r.ownerUserId,
        byteSize: r.byteSize,
        width: r.width,
        height: r.height,
      })),
      skipDuplicates: true,
    });
  } catch (err) {
    console.error(`[collab] image registry write failed (${(err as { code?: string })?.code ?? "error"})`);
  }
}

/**
 * Images still in the saved document that are in the registry, oldest first. Read-only: decodes the
 * persisted Document.yjsState into a scratch Y.Doc; never touches the live room. An image with no
 * registry row (inserted before this feature, or a failed decode) is left out and earns nothing.
 */
export async function readPresentImages(documentId: number): Promise<PresentDocumentImage[]> {
  const doc = await prisma.document.findUnique({ where: { id: documentId }, select: { yjsState: true } });
  if (!doc?.yjsState) return [];
  const scratch = new Y.Doc();
  let hashes: string[];
  try {
    Y.applyUpdate(scratch, new Uint8Array(doc.yjsState));
    const cache = new ImageDecodeCache();
    hashes = [...currentImages(scratch.getXmlFragment("default"), cache).keys()];
  } catch {
    return [];
  } finally {
    scratch.destroy();
  }
  if (hashes.length === 0) return [];
  const rows = await prisma.documentImage.findMany({
    where: { documentId, contentHash: { in: hashes } },
    orderBy: [{ firstInsertedAt: "asc" }, { id: "asc" }],
  });
  return rows.map((r) => ({
    contentHash: r.contentHash,
    ownerUserId: r.ownerUserId,
    byteSize: r.byteSize,
    width: r.width,
    height: r.height,
  }));
}
