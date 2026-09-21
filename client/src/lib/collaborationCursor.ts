import { Extension } from "@tiptap/core";
import { yCursorPlugin, defaultSelectionBuilder } from "@tiptap/y-tiptap";
import type { WebsocketProvider } from "y-websocket";

// @tiptap/extension-collaboration-cursor@3.0.0 still binds to the community `y-prosemirror`
// package's ySyncPluginKey, which is a different PluginKey instance than the one
// @tiptap/extension-collaboration@3.27.2 uses internally (it moved to @tiptap/y-tiptap for v3).
// The two plugin keys never see each other's state, so the community cursor plugin reads
// undefined sync state and throws. This is a small drop-in replacement built on the same
// @tiptap/y-tiptap primitives Collaboration itself uses, so cursors can find the sync state.

interface CursorUser {
  name: string;
  color: string;
}

interface CollaborationCursorOptions {
  provider: WebsocketProvider | null;
  user: CursorUser;
}

export const CollaborationCursor = Extension.create<CollaborationCursorOptions>({
  name: "collaborationCursor",

  addOptions() {
    return {
      provider: null,
      user: { name: "Unknown", color: "#94a3b8" },
    };
  },

  addProseMirrorPlugins() {
    const { provider, user } = this.options;
    if (!provider) return [];

    provider.awareness.setLocalStateField("user", user);

    return [
      yCursorPlugin(provider.awareness, {
        cursorBuilder: (cursorUser: CursorUser) => {
          const cursor = document.createElement("span");
          cursor.classList.add("collaboration-cursor__caret");
          cursor.setAttribute("style", `border-color: ${cursorUser.color}`);
          const label = document.createElement("div");
          label.classList.add("collaboration-cursor__label");
          label.setAttribute("style", `background-color: ${cursorUser.color}`);
          label.insertBefore(document.createTextNode(cursorUser.name), null);
          cursor.insertBefore(label, null);
          return cursor;
        },
        selectionBuilder: defaultSelectionBuilder,
      }),
    ];
  },
});
