import { Node, mergeAttributes } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { Plugin, PluginKey } from "@tiptap/pm/state";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageBreak: {
      /** Insert a page break after the current block: the next content starts on a new sheet. */
      setPageBreak: () => ReturnType;
    };
  }
}

// SPIKE - not yet registered in DocumentEditor.tsx / printExtensions.
//
// tiptap-pagination-plus has no forced break: it lays sheets out as fixed-height float spacers and
// content simply flows past them. A page break is therefore a leaf block (no text, so +0 characters
// for authorship) whose rendered height is set so that the block AFTER it begins exactly where the
// next sheet's content area begins. The height is layout, computed from the DOM - never stored.
//
// The same node, and the same function, run in the live page view and in the PDF print copy, so both
// break at the same place (the print copy is a continuous layout sliced per sheet).

const EPS = 0.75; // sub-pixel tolerance when comparing layout positions

/** Pixel bottoms of every sheet-break band in document order: content of the next sheet starts there. */
function breakerBottoms(dom: HTMLElement): number[] {
  return Array.from(dom.querySelectorAll<HTMLElement>(".rm-pages-wrapper .breaker")).map((el) => el.getBoundingClientRect().bottom);
}

/**
 * Sets the height of every page-break spacer so the content after it starts on the next sheet.
 * `period` = pageHeight + gap: the distance between two sheet starts, used to extend past the last
 * band the plugin has drawn so far (it adds sheets one step at a time). Returns true if any height
 * changed, so the caller can nudge the pagination plugin to re-count sheets.
 */
export function layoutPageBreaks(dom: HTMLElement, period: number): boolean {
  const spacers = Array.from(dom.querySelectorAll<HTMLElement>(".ft-page-break"));
  if (spacers.length === 0) return false;
  // getBoundingClientRect is in screen px; the page may be CSS-scaled to fit the stage, while
  // style.height is in unscaled CSS px. The ratio converts one to the other.
  const scale = dom.offsetWidth > 0 ? dom.getBoundingClientRect().width / dom.offsetWidth : 1;
  let changed = false;
  for (const el of spacers) {
    // Measure the break's own top with its height zeroed, top to bottom, so each break sees the
    // final positions of the breaks above it.
    el.style.height = "0px";
    const top = el.getBoundingClientRect().top;
    const starts = breakerBottoms(dom);
    let target = starts.find((b) => b > top + EPS);
    if (target === undefined) {
      const last = starts.length ? starts[starts.length - 1]! : top;
      const p = period * scale;
      target = last + Math.ceil((top + EPS - last) / p + 1e-9) * p;
      if (target <= top + EPS) target += p;
    }
    const height = Math.max(0, (target - top) / scale);
    const next = `${Math.round(height * 100) / 100}px`;
    if (el.dataset.ftApplied !== next) changed = true;
    el.dataset.ftApplied = next;
    el.style.height = next;
  }
  return changed;
}

const layoutKey = new PluginKey("ftPageBreakLayout");

export interface PageBreakOptions {
  /** Gap between sheets (px): 24 on screen, 0 in the print copy. */
  getPeriod: (editor: Editor) => number;
  /** Called after heights change so the owner can nudge the pagination plugin (empty transaction). */
  onLayoutChanged?: (view: EditorView) => void;
}

export const PageBreak = Node.create<PageBreakOptions>({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      getPeriod: (editor: Editor) => {
        const s = (editor.storage as unknown as { PaginationPlus?: { pageHeight: number; pageGap: number } }).PaginationPlus;
        return s ? s.pageHeight + s.pageGap : 1056;
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-page-break]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-page-break": "", class: "ft-page-break" })];
  },

  addNodeView() {
    return () => {
      const dom = document.createElement("div");
      dom.className = "ft-page-break";
      dom.setAttribute("data-page-break", "");
      dom.contentEditable = "false";
      const label = document.createElement("span");
      label.className = "ft-page-break-label";
      label.textContent = "Page break";
      dom.appendChild(label);
      return { dom };
    };
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain }) =>
          chain().insertContent([{ type: this.name }, { type: "paragraph" }]).run(),
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Enter": () => (this.editor.isEditable ? this.editor.commands.setPageBreak() : false),
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const options = this.options;
    return [
      new Plugin({
        key: layoutKey,
        view: (view) => {
          let raf = 0;
          const run = () => {
            raf = 0;
            if (editor.isDestroyed) return;
            if (layoutPageBreaks(view.dom as HTMLElement, options.getPeriod(editor))) options.onLayoutChanged?.(view);
          };
          return {
            update: () => {
              if (!raf) raf = requestAnimationFrame(run);
            },
            destroy: () => {
              if (raf) cancelAnimationFrame(raf);
            },
          };
        },
      }),
    ];
  },
});
