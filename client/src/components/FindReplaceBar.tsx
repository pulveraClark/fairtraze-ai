import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { getSearchState, replaceMatches } from "../lib/searchReplace";

interface Props {
  editor: Editor;
  /** False in the instructor's read-only view: find only, no replace controls. */
  editable: boolean;
  showReplace: boolean;
  onToggleReplace: () => void;
  onClose: () => void;
}

const inputClass =
  "h-8 min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 text-sm text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600";
const btnClass =
  "min-h-8 h-8 shrink-0 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50";

// Find and replace. The match list lives in a ProseMirror plugin (lib/searchReplace.ts) as
// decorations only. Replace is an ordinary editor edit credited to whoever presses it; replacements
// identical to the matched text are skipped, and "Replace all" applies one transaction per match so
// unchanged text between matches is never re-credited (see replaceMatches).
export function FindReplaceBar({ editor, editable, showReplace, onToggleReplace, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [notice, setNotice] = useState("");
  const findRef = useRef<HTMLInputElement | null>(null);

  const search = getSearchState(editor.state);
  const total = search.matches.length;

  useEffect(() => {
    findRef.current?.focus();
    findRef.current?.select();
  }, []);

  // Push the query into the plugin. Highlights vanish when the bar closes.
  useEffect(() => {
    editor.commands.setSearch(query, caseSensitive);
    setNotice("");
  }, [editor, query, caseSensitive]);
  useEffect(() => () => {
    if (!editor.isDestroyed) editor.commands.clearSearch();
  }, [editor]);

  // Keep the current match visible without moving the user's caret.
  useEffect(() => {
    const m = search.matches[search.current];
    if (!m) return;
    try {
      const { node } = editor.view.domAtPos(m.from);
      const el = node instanceof Element ? node : node.parentElement;
      el?.scrollIntoView({ block: "center", behavior: "auto" });
    } catch {
      // position not mounted yet - highlight still shows
    }
  }, [editor, search.current, search.matches]);

  const doReplaceOne = () => {
    const res = replaceMatches(editor, replacement, search.current);
    if (res.replaced === 0 && res.skipped > 0) {
      setNotice("Skipped: the replacement is identical to the matched text.");
      editor.commands.findNext();
    } else setNotice("");
  };
  const doReplaceAll = () => {
    const res = replaceMatches(editor, replacement);
    setNotice(
      res.skipped > 0
        ? `Replaced ${res.replaced}; skipped ${res.skipped} identical.`
        : res.replaced > 0
          ? `Replaced ${res.replaced}.`
          : ""
    );
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      editor.commands.focus();
    } else if (e.key === "Enter" && (e.target as HTMLElement).dataset.role === "find") {
      e.preventDefault();
      if (e.shiftKey) editor.commands.findPrevious();
      else editor.commands.findNext();
    }
  };

  return (
    <div
      role="search"
      aria-label="Find and replace"
      onKeyDown={onKeyDown}
      className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white"
    >
      <div className="flex min-w-0 basis-56 grow items-center gap-2">
        <label className="sr-only" htmlFor="ft-find-input">Find</label>
        <input
          id="ft-find-input"
          ref={findRef}
          data-role="find"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find"
          className={inputClass}
        />
        <span className="shrink-0 text-xs text-slate-600 tabular-nums whitespace-nowrap" aria-live="polite">
          {query ? (total === 0 ? "No matches" : `${search.current + 1} of ${total}`) : ""}
        </span>
      </div>
      {editable && showReplace && (
        <div className="flex min-w-0 basis-56 grow items-center gap-2">
          <label className="sr-only" htmlFor="ft-replace-input">Replace with</label>
          <input
            id="ft-replace-input"
            type="text"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            placeholder="Replace with"
            className={inputClass}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={btnClass} onClick={() => editor.commands.findPrevious()} disabled={total === 0} title="Previous match (Shift+Enter)" aria-label="Previous match">
          Previous
        </button>
        <button type="button" className={btnClass} onClick={() => editor.commands.findNext()} disabled={total === 0} title="Next match (Enter)" aria-label="Next match">
          Next
        </button>
        <label className="flex items-center gap-1.5 text-xs text-slate-700 min-h-8 px-1">
          <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} className="h-4 w-4 accent-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600" />
          Match case
        </label>
        {editable && (
          <>
            {!showReplace && (
              <button type="button" className={btnClass} onClick={onToggleReplace} title="Replace (Ctrl+H)">
                Replace…
              </button>
            )}
            {showReplace && (
              <>
                <button type="button" className={btnClass} onClick={doReplaceOne} disabled={total === 0}>
                  Replace
                </button>
                <button type="button" className={btnClass} onClick={doReplaceAll} disabled={total === 0}>
                  Replace all
                </button>
              </>
            )}
          </>
        )}
        <button type="button" className={btnClass} onClick={() => { onClose(); editor.commands.focus(); }} title="Close (Esc)" aria-label="Close find and replace">
          Close
        </button>
      </div>
      {notice && <p className="basis-full text-xs text-slate-700" role="status">{notice}</p>}
    </div>
  );
}
