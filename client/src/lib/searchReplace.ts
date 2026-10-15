import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface SearchMatch {
  from: number;
  to: number;
}

export interface SearchState {
  query: string;
  caseSensitive: boolean;
  matches: SearchMatch[];
  /** Index into `matches` of the highlighted match, or -1 when there are none. */
  current: number;
}

type SearchMeta = { query?: string; caseSensitive?: boolean; current?: number };

export const searchReplaceKey = new PluginKey<SearchState>("ftSearchReplace");

const EMPTY: SearchState = { query: "", caseSensitive: false, matches: [], current: -1 };

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Matches never span two text blocks (a paragraph break is a real boundary). Within a block each
// character of text AND each inline atom (hard break, image) takes exactly one document position,
// so a string index maps straight to a position: from = blockStart + 1 + index.
export function findMatches(doc: PMNode, query: string, caseSensitive: boolean): SearchMatch[] {
  if (!query) return [];
  const re = new RegExp(escapeRegExp(query), caseSensitive ? "g" : "gi");
  const out: SearchMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = "";
    node.forEach((child) => {
      text += child.isText ? (child.text ?? "") : "\n";
    });
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      out.push({ from: pos + 1 + m.index, to: pos + 1 + m.index + m[0].length });
    }
    return false;
  });
  return out;
}

function buildState(doc: PMNode, query: string, caseSensitive: boolean, previousCurrent: number): SearchState {
  const matches = findMatches(doc, query, caseSensitive);
  const current = matches.length === 0 ? -1 : Math.min(Math.max(previousCurrent, 0), matches.length - 1);
  return { query, caseSensitive, matches, current };
}

export function getSearchState(state: EditorState): SearchState {
  return searchReplaceKey.getState(state) ?? EMPTY;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    searchReplace: {
      setSearch: (query: string, caseSensitive: boolean) => ReturnType;
      clearSearch: () => ReturnType;
      findNext: () => ReturnType;
      findPrevious: () => ReturnType;
      replaceCurrent: (replacement: string) => ReturnType;
      replaceAll: (replacement: string) => ReturnType;
    };
  }
}

/**
 * Result of a replace operation, for UI messages and tests.
 * `skipped` counts matches whose text already equals the replacement.
 */
export interface ReplaceResult {
  replaced: number;
  skipped: number;
}

/**
 * Replaces matches, one transaction per match, last match first.
 *
 * Why not a single transaction: authorshipCapture.ts diffs the plain text with ONE common
 * prefix/suffix trim per Yjs update. One transaction replacing matches that are far apart would be
 * recorded as a single delete+insert spanning every unchanged character between the first and last
 * match, re-crediting all of it to whoever pressed "Replace all". One transaction per match keeps
 * each recorded edit to just the replaced text.
 *
 * A match whose text already equals the replacement is skipped, so "Replace all" cannot re-credit
 * unchanged text.
 */
export function replaceMatches(editor: Editor, replacement: string, onlyIndex?: number): ReplaceResult {
  const result: ReplaceResult = { replaced: 0, skipped: 0 };
  if (!editor.isEditable) return result;
  const s = getSearchState(editor.state);
  const targets =
    onlyIndex === undefined
      ? s.matches.map((m, i) => ({ m, i })).reverse()
      : s.matches[onlyIndex]
        ? [{ m: s.matches[onlyIndex], i: onlyIndex }]
        : [];
  for (const { m } of targets) {
    const existing = editor.state.doc.textBetween(m.from, m.to, "\n", "\n");
    if (existing === replacement) {
      result.skipped++;
      continue;
    }
    const tr = editor.state.tr;
    if (replacement === "") tr.delete(m.from, m.to);
    else tr.insertText(replacement, m.from, m.to);
    editor.view.dispatch(tr);
    result.replaced++;
  }
  return result;
}

export const SearchReplace = Extension.create({
  name: "searchReplace",

  addCommands() {
    return {
      setSearch:
        (query: string, caseSensitive: boolean) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(searchReplaceKey, { query, caseSensitive, current: 0 } satisfies SearchMeta);
          return true;
        },
      clearSearch:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(searchReplaceKey, { query: "", current: -1 } satisfies SearchMeta);
          return true;
        },
      findNext:
        () =>
        ({ state, tr, dispatch }) => {
          const s = getSearchState(state);
          if (s.matches.length === 0) return false;
          if (dispatch) tr.setMeta(searchReplaceKey, { current: (s.current + 1) % s.matches.length } satisfies SearchMeta);
          return true;
        },
      findPrevious:
        () =>
        ({ state, tr, dispatch }) => {
          const s = getSearchState(state);
          if (s.matches.length === 0) return false;
          if (dispatch) {
            tr.setMeta(searchReplaceKey, { current: (s.current - 1 + s.matches.length) % s.matches.length } satisfies SearchMeta);
          }
          return true;
        },
      // Replace commands dispatch their own transactions (see replaceMatches), so they run outside
      // TipTap's single-transaction command pipeline and just report whether anything changed.
      replaceCurrent:
        (replacement: string) =>
        ({ editor }) => {
          const s = getSearchState(editor.state);
          if (s.current < 0) return false;
          const before = s.current;
          const res = replaceMatches(editor as Editor, replacement, before);
          if (res.replaced === 0 && res.skipped > 0) {
            // Identical replacement: just move on to the next match.
            editor.commands.findNext();
          }
          return res.replaced > 0;
        },
      replaceAll:
        (replacement: string) =>
        ({ editor }) => replaceMatches(editor as Editor, replacement).replaced > 0,
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchReplaceKey,
        state: {
          init: () => EMPTY,
          apply(tr, prev) {
            const meta = tr.getMeta(searchReplaceKey) as SearchMeta | undefined;
            if (meta) {
              const query = meta.query ?? prev.query;
              const caseSensitive = meta.caseSensitive ?? prev.caseSensitive;
              const next = buildState(tr.doc, query, caseSensitive, meta.current ?? prev.current);
              if (meta.current !== undefined && next.matches.length > 0) {
                next.current = Math.min(Math.max(meta.current, 0), next.matches.length - 1);
              }
              return next;
            }
            if (tr.docChanged && prev.query) return buildState(tr.doc, prev.query, prev.caseSensitive, prev.current);
            return prev;
          },
        },
        props: {
          decorations(state) {
            const s = searchReplaceKey.getState(state);
            if (!s || s.matches.length === 0) return DecorationSet.empty;
            return DecorationSet.create(
              state.doc,
              s.matches.map((m, i) =>
                Decoration.inline(m.from, m.to, {
                  class: i === s.current ? "ft-find-match ft-find-match-current" : "ft-find-match",
                })
              )
            );
          },
        },
      }),
    ];
  },
});
