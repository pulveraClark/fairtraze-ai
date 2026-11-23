import { Extension } from "@tiptap/core";
import type { CommandProps } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";


declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    indent: {
      /** Indent the selected paragraphs/headings one level, or sink the list item at the cursor. */
      indent: () => ReturnType;
      /** Reverse of indent. */
      outdent: () => ReturnType;
      /** Reset indent to 0 on every selected paragraph/heading (part of "Clear formatting"). */
      clearIndent: () => ReturnType;
    };
  }
}

export const INDENT_STEP_PX = 48; // 0.5in at 96dpi
export const MAX_INDENT_LEVEL = 8;
const LIST_ITEM_TYPES = ["taskItem", "listItem"] as const;

function listItemTypeAtCursor(isActive: (name: string) => boolean): string | null {
  // taskItem first: a checklist item is also inside a generic list context in some schemas.
  for (const name of LIST_ITEM_TYPES) if (isActive(name)) return name;
  return null;
}

// Indent for paragraphs and headings is a plain node attribute (`indent`, 0-8 levels of 0.5in),
// same "global attribute" pattern as lineHeight.ts - no official free indent extension exists.
// Lists use the official sinkListItem/liftListItem. An attribute change contains no text, so
// authorshipCapture.ts sees zero characters for it (proved in authorshipCaptureEditorTools.test.ts).
//
// Keyboard: Tab / Shift+Tab indent / outdent, but never trap focus (WCAG 2.1.2): pressing Escape
// arms a one-shot "let the next Tab through", which moves browser focus out of the editor.
// Tab inside a table is left to the table extension (next cell); Shift+Tab with nothing to
// outdent is also passed through so focus can move backwards.
export const Indent = Extension.create({
  name: "indent",
  priority: 1000, // must run before ListItem/Table Tab handling to be able to yield or swallow

  addOptions() {
    return { types: ["paragraph", "heading"] as string[] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => {
              const n = Number.parseInt(element.getAttribute("data-indent") ?? "0", 10);
              return Number.isFinite(n) ? Math.min(Math.max(n, 0), MAX_INDENT_LEVEL) : 0;
            },
            renderHTML: (attributes) => {
              const n = Number(attributes.indent) || 0;
              if (n <= 0) return {};
              return { "data-indent": String(n), style: `margin-left: ${n * INDENT_STEP_PX}px` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    const shift = (delta: 1 | -1) =>
      () =>
      ({ editor, state, tr, dispatch, commands }: CommandProps) => {
        const listType = listItemTypeAtCursor((n) => editor.isActive(n));
        if (listType) {
          return delta === 1 ? commands.sinkListItem(listType) : commands.liftListItem(listType);
        }
        const { from, to } = state.selection;
        let changed = false;
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (!this.options.types.includes(node.type.name)) return;
          const current = Number(node.attrs.indent) || 0;
          const next = Math.min(Math.max(current + delta, 0), MAX_INDENT_LEVEL);
          if (next !== current) {
            if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
            changed = true;
          }
        });
        return changed;
      };
    const clearIndent =
      () =>
      ({ state, tr, dispatch }: CommandProps) => {
        const { from, to } = state.selection;
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (!this.options.types.includes(node.type.name)) return;
          if ((Number(node.attrs.indent) || 0) !== 0 && dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: 0 });
        });
        return true;
      };
    return { indent: shift(1), outdent: shift(-1), clearIndent };
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        if (!editor.isEditable) return false;
        if (editor.isActive("table")) return false; // table extension moves to the next cell
        editor.commands.indent();
        return true; // swallow even when nothing changed; Escape then Tab leaves the editor
      },
      "Shift-Tab": ({ editor }) => {
        if (!editor.isEditable) return false;
        if (editor.isActive("table")) return false;
        return editor.commands.outdent(); // false when nothing to outdent -> focus moves back
      },
    };
  },

  addProseMirrorPlugins() {
    let escapeArmed = false;
    return [
      new Plugin({
        props: {
          // handleDOMEvents runs before every keymap plugin. Returning true here (without
          // preventDefault) stops ProseMirror's keymaps from claiming the Tab, so the browser's
          // default focus movement happens.
          handleDOMEvents: {
            keydown: (_view, event) => {
              const e = event as KeyboardEvent;
              if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") return false;
              if (e.key === "Escape") {
                escapeArmed = true;
                return false;
              }
              if (e.key === "Tab" && escapeArmed && !e.ctrlKey && !e.altKey && !e.metaKey) {
                escapeArmed = false;
                return true;
              }
              escapeArmed = false;
              return false;
            },
            blur: () => {
              escapeArmed = false;
              return false;
            },
          },
        },
      }),
    ];
  },
});
