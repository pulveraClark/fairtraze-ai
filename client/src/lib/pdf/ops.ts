// Draw-op list shared by the layout collector (main thread, needs the DOM) and the PDF writer
// (Web Worker, needs no DOM). Everything is plain data so it can be posted to the worker.
// All coordinates are CSS px, relative to the top-left corner of the SHEET the op belongs to.

export interface Rgba { r: number; g: number; b: number; a: number }

export interface FontFace { family: string; weight: 400 | 700; italic: boolean }

/** Where a text's baseline is: `top` of its inline box plus the ascent of this font at this size. */
export interface LineRef { top: number; face: FontFace; size: number }

export type Op =
  | { k: "rect"; x: number; y: number; w: number; h: number; c: Rgba }
  /** One piece of one line (a word, or the part of a word that wraps onto a line). `top` is its inline box top. */
  | { k: "text"; s: string; x: number; top: number; w: number; face: FontFace; size: number; c: Rgba }
  /** Underline / strike across `w` px starting at `x`, for a run on the line whose inline box starts at `top`. */
  | { k: "deco"; kind: "underline" | "strike"; x: number; top: number; w: number; face: FontFace; size: number; c: Rgba }
  /**
   * A list marker, drawn with the LIST ITEM's font (not the text's) on the first line's baseline.
   * `bullet` shapes follow Blink's rules; `number` is the text ("1. ") right-aligned to `x`.
   */
  | { k: "marker"; kind: "disc" | "circle" | "square" | "number"; label: string; x: number; line: LineRef; face: FontFace; size: number; c: Rgba }
  | { k: "check"; x: number; y: number; w: number; h: number; checked: boolean; accent: Rgba }
  | { k: "img"; x: number; y: number; w: number; h: number; mime: "image/png" | "image/jpeg"; bytes: Uint8Array }
  | { k: "link"; x: number; y: number; w: number; h: number; uri: string };

export interface SheetOps { ops: Op[] }

export interface PdfJob {
  /** Page size in CSS px (96 dpi). */
  widthPx: number;
  heightPx: number;
  title: string;
  sheets: SheetOps[];
  /** Font files to try, in order, for each face (faceKey): the family's own parts, then the default family's. */
  fontChains: Record<string, string[]>;
}

export type WorkerMessage =
  | { type: "progress"; done: number; total: number }
  | { type: "done"; bytes: Uint8Array; missing: string[] }
  | { type: "error"; message: string };

export const faceKey = (f: FontFace) => `${f.family}|${f.weight}|${f.italic ? "i" : "n"}`;
