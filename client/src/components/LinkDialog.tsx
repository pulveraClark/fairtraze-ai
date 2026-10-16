import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { normalizeLinkUrl } from "@shared/linkUrl";
import { useFocusTrap } from "../lib/useFocusTrap";

interface Props {
  editor: Editor;
  onClose: () => void;
}

const inputClass =
  "h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600";
const btnClass =
  "min-h-9 rounded border px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50";

// Insert, edit or remove a link. Only http, https and mailto are accepted (shared/src/linkUrl.ts);
// anything else - javascript:, data:, ... - is rejected with a message. Adding a link to selected
// text is a mark change (no characters). With no selection the dialog also asks for the link text,
// which is typed into the document like any other text and credited to the person who typed it.
export function LinkDialog({ editor, onClose }: Props) {
  const existing = editor.getAttributes("link").href as string | undefined;
  const hasSelection = !editor.state.selection.empty;
  const [url, setUrl] = useState(existing ?? "");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const urlRef = useRef<HTMLInputElement | null>(null);
  // Tab stays inside; Esc closes; focus returns to the editor (see useFocusTrap).
  const dialogRef = useFocusTrap<HTMLFormElement>(onClose, () => { if (!editor.isDestroyed) editor.commands.focus(); });

  useEffect(() => {
    urlRef.current?.focus();
    urlRef.current?.select();
  }, []);

  const needsText = !hasSelection && !existing;

  const apply = () => {
    const safe = normalizeLinkUrl(url);
    if (!safe) {
      setError("Enter a web address (http or https) or an email link (mailto:). Other link types are not allowed.");
      return;
    }
    if (needsText && !text.trim()) {
      setError("Enter the text to show for the link.");
      return;
    }
    const chain = editor.chain().focus();
    if (needsText) {
      chain
        .insertContent({ type: "text", text: text.trim(), marks: [{ type: "link", attrs: { href: safe } }] })
        .run();
    } else {
      chain.extendMarkRange("link").setLink({ href: safe }).run();
    }
    onClose();
  };

  const remove = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/40 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ft-link-title"
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
        onSubmit={(e) => { e.preventDefault(); apply(); }}
      >
        <h2 id="ft-link-title" className="text-sm font-semibold text-slate-800">{existing ? "Edit link" : "Insert link"}</h2>
        <div className="mt-3 space-y-3">
          {needsText && (
            <div>
              <label htmlFor="ft-link-text" className="block text-xs font-semibold text-slate-700 mb-1">Text</label>
              <input id="ft-link-text" className={inputClass} value={text} onChange={(e) => { setText(e.target.value); setError(""); }} />
            </div>
          )}
          <div>
            <label htmlFor="ft-link-url" className="block text-xs font-semibold text-slate-700 mb-1">Web address</label>
            <input
              id="ft-link-url"
              ref={urlRef}
              className={inputClass}
              value={url}
              placeholder="https://example.com"
              onChange={(e) => { setUrl(e.target.value); setError(""); }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "ft-link-error" : undefined}
            />
            <p className="mt-1 text-xs text-slate-600">Links open in a new tab. Only http, https and mailto are allowed.</p>
          </div>
          {error && <p id="ft-link-error" role="alert" className="text-xs font-medium text-red-700">{error}</p>}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {existing && (
            <button type="button" onClick={remove} className={`${btnClass} mr-auto border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
              Remove link
            </button>
          )}
          <button type="button" onClick={onClose} className={`${btnClass} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
            Cancel
          </button>
          <button type="submit" className={`${btnClass} border-indigo-700 bg-indigo-700 text-white hover:bg-indigo-800`}>
            Apply
          </button>
        </div>
      </form>
    </div>
  );
}
