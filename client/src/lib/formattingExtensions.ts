import { Extension } from "@tiptap/core";
import Strike from "@tiptap/extension-strike";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import type { StarterKitOptions } from "@tiptap/starter-kit";
import { isSafeLinkUrl } from "@shared/linkUrl";
import { Indent } from "./indent";

// Everything here is formatting only: marks, node attributes and leaf nodes carry no text, so
// authorshipCapture.ts records zero characters for them (server/test/authorshipCaptureEditorTools
// .test.ts). It is shared by the live editor and the PDF print copy so both render identically.

/** StarterKit options common to the live editor and the print copy. */
export const starterKitOptions: Partial<StarterKitOptions> = {
  undoRedo: false,
  // Replaced below by StrikeWithShortcut (Ctrl+Shift+X instead of TipTap's Ctrl+Shift+S).
  strike: false,
  link: {
    // Click opens the link only when the editor is read-only (instructor view); while editing a
    // click places the caret and links are opened from the link dialog / Ctrl+click.
    openOnClick: "whenNotEditable",
    autolink: true,
    linkOnPaste: true,
    defaultProtocol: "https",
    HTMLAttributes: { target: "_blank", rel: "noopener noreferrer", class: "ft-link" },
    // http, https and mailto only. Applied when a link is parsed or rendered, so a hostile href
    // written into the shared Yjs document by a modified client is never rendered as a link.
    isAllowedUri: (url) => isSafeLinkUrl(url),
    shouldAutoLink: (url) => isSafeLinkUrl(url),
  },
};

export const StrikeWithShortcut = Strike.extend({
  addKeyboardShortcuts() {
    return { "Mod-Shift-x": () => this.editor.commands.toggleStrike() };
  },
});

/** Strike, checklist and indent. Order matters little; Indent sets its own priority. */
export const formattingExtensions = [StrikeWithShortcut, TaskList, TaskItem.configure({ nested: true }), Indent];

export interface EditorShortcutHandlers {
  onLink: () => void;
  onFind: () => void;
  onReplace: () => void;
}

/**
 * Ctrl+K link, Ctrl+F find, Ctrl+H replace. Only active while the editor has focus, so the
 * browser's own shortcuts keep working everywhere else on the page. (The read-only view, which
 * cannot hold editor focus, gets Ctrl+F from the wrapper in DocumentEditor.tsx.)
 */
export const EditorShortcuts = Extension.create<{ handlers: () => EditorShortcutHandlers }>({
  name: "editorShortcuts",

  addOptions() {
    return { handlers: () => ({ onLink: () => {}, onFind: () => {}, onReplace: () => {} }) };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-k": () => {
        if (!this.editor.isEditable) return false;
        this.options.handlers().onLink();
        return true;
      },
      "Mod-f": () => {
        this.options.handlers().onFind();
        return true;
      },
      "Mod-h": () => {
        if (!this.editor.isEditable) return false;
        this.options.handlers().onReplace();
        return true;
      },
    };
  },
});
