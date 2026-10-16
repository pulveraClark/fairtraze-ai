import type { JSONContent } from "@tiptap/core";
import type { PageSizeKey } from "@shared/pageSizes";
import { layoutPrintCopy, type PrintLayoutOptions } from "../printDocument";
import { collectLayout } from "./collectLayout";
import { fontChains, resolveDocFamily } from "./fontRegistry";
import type { PdfJob, WorkerMessage } from "./ops";

// The real PDF: lays the document out offscreen exactly as the page view does, reads every line's
// position from the browser, and has a Web Worker write a vector PDF (pdf-lib) from that. This
// module (and so pdf-lib, via the worker) is loaded with a dynamic import() only when the user
// asks for a PDF. Read-only: it never touches the live editor, the Yjs document or the server.

export type PdfStage = "layout" | "measure" | "build";

export interface PdfProgress {
  stage: PdfStage;
  /** 0..1 over the whole export. */
  fraction: number;
  /** Human text, e.g. "Writing sheet 3 of 8". */
  label: string;
}

export interface PdfExportOptions {
  json: JSONContent;
  size: PageSizeKey;
  layout?: PrintLayoutOptions;
  title: string;
  signal?: AbortSignal;
  onProgress?: (p: PdfProgress) => void;
}

export interface PdfExportResult {
  blob: Blob;
  pages: number;
  /** Characters no bundled font has (emoji, CJK ...): left out of the PDF, reported to the user. */
  missing: string[];
  timings: { layoutMs: number; collectMs: number; workerMs: number };
}

const abortError = () => new DOMException("PDF export cancelled", "AbortError");

// Share of the progress bar each stage owns.
const SHARE = { layout: 0.3, measure: 0.3, build: 0.4 } as const;

export async function buildPdf(opts: PdfExportOptions): Promise<PdfExportResult> {
  const { signal, onProgress } = opts;
  const report = (stage: PdfStage, within: number, label: string) => {
    const base = stage === "layout" ? 0 : stage === "measure" ? SHARE.layout : SHARE.layout + SHARE.measure;
    onProgress?.({ stage, fraction: Math.min(1, base + within * SHARE[stage]), label });
  };
  if (signal?.aborted) throw abortError();

  report("layout", 0, "Laying out the pages…");
  const t0 = performance.now();
  const copy = await layoutPrintCopy(opts.json, opts.size, opts.layout ?? {});
  try {
    if (signal?.aborted) throw abortError();
    const t1 = performance.now();
    report("measure", 0, "Measuring the text…");
    const sheets = await collectLayout(copy.root, {
      origin: copy.root,
      sheetHeightPx: copy.period, // sheets are laid out with the page view's gap between them
      sheetCount: copy.pageCount,
      resolveFamily: resolveDocFamily,
      signal,
      onProgress: (f) => report("measure", f, "Measuring the text…"),
    });
    const t2 = performance.now();
    if (signal?.aborted) throw abortError();

    const job: PdfJob = {
      widthPx: copy.geometry.widthPx,
      heightPx: copy.geometry.heightPx,
      title: opts.title,
      sheets,
      fontChains: fontChains(),
    };
    // The offscreen copy is not needed once its geometry has been read.
    copy.destroy();

    const worker = new Worker(new URL("./pdfWorker.ts", import.meta.url), { type: "module" });
    const { bytes, missing } = await new Promise<{ bytes: Uint8Array; missing: string[] }>((resolve, reject) => {
      const onAbort = () => {
        worker.terminate();
        reject(abortError());
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
        const m = e.data;
        if (m.type === "progress") report("build", m.done / Math.max(1, m.total), `Writing sheet ${m.done} of ${m.total}…`);
        else if (m.type === "done") {
          signal?.removeEventListener("abort", onAbort);
          resolve({ bytes: m.bytes, missing: m.missing });
        } else {
          signal?.removeEventListener("abort", onAbort);
          reject(new Error(m.message));
        }
      };
      worker.onerror = (e) => {
        signal?.removeEventListener("abort", onAbort);
        reject(new Error(e.message || "The PDF writer failed to start."));
      };
      report("build", 0, "Writing the PDF…");
      worker.postMessage(job);
    }).finally(() => worker.terminate());
    const t3 = performance.now();

    onProgress?.({ stage: "build", fraction: 1, label: "Done" });
    return {
      blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
      pages: sheets.length,
      missing,
      timings: { layoutMs: Math.round(t1 - t0), collectMs: Math.round(t2 - t1), workerMs: Math.round(t3 - t2) },
    };
  } finally {
    copy.destroy(); // idempotent: safe after the early destroy above
  }
}

/** Saves the blob as `fileName` through a temporary link (one click for the user). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
