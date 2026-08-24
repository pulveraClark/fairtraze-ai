import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import type { AuthorshipUser } from "../lib/authorshipHighlight";
import { getUserColor } from "../lib/collabColors";

export type ConnStatus = "connecting" | "connected" | "disconnected";

export interface PresentUser {
  clientId: number;
  name: string;
  color: string;
}

export const ToolbarButton = forwardRef<
  HTMLButtonElement,
  { onClick: () => void; active: boolean; label: string; children: React.ReactNode }
>(function ToolbarButton({ onClick, active, label, children }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`w-7 h-7 rounded flex items-center justify-center text-sm font-semibold transition-colors ${
        active
          ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
          : "text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
      }`}
    >
      {children}
    </button>
  );
});

const FONT_COLORS = ["#0f172a", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#2563eb", "#7c3aed"];
const HIGHLIGHT_COLORS = ["#fef08a", "#fecaca", "#fed7aa", "#bbf7d0", "#bfdbfe", "#e9d5ff"];

const FONT_FAMILIES: { label: string; value: string | null }[] = [
  { label: "Default", value: null },
  { label: "Sans Serif", value: "Arial, Helvetica, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Monospace", value: "'Courier New', Courier, monospace" },
  { label: "Comic Sans", value: "'Comic Sans MS', 'Comic Sans', cursive" },
];

const FONT_SIZES: { label: string; value: string | null }[] = [
  { label: "Default", value: null },
  { label: "12", value: "12px" },
  { label: "14", value: "14px" },
  { label: "16", value: "16px" },
  { label: "18", value: "18px" },
  { label: "20", value: "20px" },
  { label: "24", value: "24px" },
  { label: "28", value: "28px" },
  { label: "32", value: "32px" },
];

function ColorMenu({
  label,
  icon,
  colors,
  activeColor,
  onPick,
  onClear,
}: {
  label: string;
  icon: React.ReactNode;
  colors: string[];
  activeColor: string | null;
  onPick: (color: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Portaled to document.body and positioned via getBoundingClientRect, exactly like
  // InfoTooltip.tsx — the toolbar's overflow-x-auto (see Toolbar's root div) computes
  // overflow-y as auto too per the CSS spec, which would silently clip an absolutely
  // positioned dropdown nested inside it (found via manual verification: the swatch
  // buttons were clickable but invisible).
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const btn = btnRef.current.getBoundingClientRect();
    setPos({ top: btn.bottom + 4, left: btn.left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        menuRef.current && !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  return (
    <>
      <ToolbarButton
        ref={btnRef}
        label={label}
        active={open || !!activeColor}
        onClick={() => setOpen((v) => !v)}
      >
        {icon}
      </ToolbarButton>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="p-1.5 bg-white border border-slate-200 rounded-lg shadow-md flex items-center gap-1"
        >
          <button
            type="button"
            title="Clear"
            aria-label="Clear color"
            onClick={() => {
              onClear();
              setOpen(false);
            }}
            className="w-5 h-5 rounded-full border border-slate-300 flex items-center justify-center text-slate-400 hover:bg-slate-50 shrink-0"
          >
            ✕
          </button>
          <span className="w-px h-4 bg-slate-200 mx-0.5" />
          {colors.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              aria-label={`Color ${c}`}
              onClick={() => {
                onPick(c);
                setOpen(false);
              }}
              className={`w-5 h-5 rounded-full border shrink-0 ${
                activeColor === c ? "ring-2 ring-offset-1 ring-indigo-400" : "border-slate-200"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

export function PresenceChip({ user }: { user: PresentUser }) {
  const initial = user.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      title={user.name}
      className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 ring-2 ring-white"
      style={{ backgroundColor: user.color }}
    >
      {initial}
    </span>
  );
}

export function AuthorshipLegend({ users }: { users: AuthorshipUser[] }) {
  if (users.length === 0) return null;
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 border-b border-slate-100 bg-slate-50/60 flex-wrap">
      {users.map((u) => (
        <span key={u.id} className="flex items-center gap-1.5 text-[11px] text-slate-600">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getUserColor(u.id) }} />
          {u.name}
        </span>
      ))}
    </div>
  );
}

export function Toolbar({
  editor,
  editable,
  connStatus,
  presentUsers,
  showAuthorship,
  onToggleAuthorship,
  onImportClick,
  importing,
  onInsertImageClick,
  onExportDocx,
  exporting,
  onExportPdf,
  showComments,
  onToggleComments,
  onAddComment,
  hasSelection,
}: {
  editor: Editor;
  editable: boolean;
  connStatus: ConnStatus;
  presentUsers: PresentUser[];
  showAuthorship: boolean;
  onToggleAuthorship: () => void;
  onImportClick: () => void;
  importing: boolean;
  onInsertImageClick: () => void;
  onExportDocx: () => void;
  exporting: boolean;
  onExportPdf: () => void;
  showComments: boolean;
  onToggleComments: () => void;
  onAddComment: () => void;
  hasSelection: boolean;
}) {
  const statusLabel = connStatus === "connected" ? "" : connStatus === "connecting" ? "Connecting…" : "Reconnecting…";
  const wordCount = editor.storage.characterCount?.words?.() ?? 0;
  const charCount = editor.storage.characterCount?.characters?.() ?? 0;

  return (
    <div className="flex items-center gap-0.5 px-3 py-2 border-b border-slate-100 bg-slate-50 overflow-x-auto">
      {editable && (
        <>
          <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
            B
          </ToolbarButton>
          <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <span className="italic">I</span>
          </ToolbarButton>

          <span className="w-px h-4 bg-slate-200 mx-1.5" />

          <ToolbarButton
            label="Heading 1"
            active={editor.isActive("heading", { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            H1
          </ToolbarButton>
          <ToolbarButton
            label="Heading 2"
            active={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H2
          </ToolbarButton>

          <span className="w-px h-4 bg-slate-200 mx-1.5" />

          <ToolbarButton
            label="Bullet list"
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            label="Numbered list"
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M4 6h1v2M4 10h2l-2 2h2M4 18h2M4 16h2" />
            </svg>
          </ToolbarButton>

          <span className="w-px h-4 bg-slate-200 mx-1.5" />

          <ToolbarButton
            label="Align left"
            active={editor.isActive({ textAlign: "left" })}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h13" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            label="Align center"
            active={editor.isActive({ textAlign: "center" })}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10M5.5 18h13" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            label="Align right"
            active={editor.isActive({ textAlign: "right" })}
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M10 12h10M7 18h13" />
            </svg>
          </ToolbarButton>

          <span className="w-px h-4 bg-slate-200 mx-1.5" />

          <ColorMenu
            label="Text color"
            icon={<span className="font-bold text-sm leading-none">A</span>}
            colors={FONT_COLORS}
            activeColor={editor.getAttributes("textStyle").color ?? null}
            onPick={(c) => editor.chain().focus().setColor(c).run()}
            onClear={() => editor.chain().focus().unsetColor().run()}
          />
          <ColorMenu
            label="Highlight color"
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 11l6-6 4 4-6 6m-4-4l-4 10 10-4m-6-6l6 6" />
              </svg>
            }
            colors={HIGHLIGHT_COLORS}
            activeColor={editor.getAttributes("highlight").color ?? null}
            onPick={(c) => editor.chain().focus().toggleHighlight({ color: c }).run()}
            onClear={() => editor.chain().focus().unsetHighlight().run()}
          />

          <span className="w-px h-4 bg-slate-200 mx-1.5" />

          <select
            title="Font family"
            aria-label="Font family"
            value={editor.getAttributes("textStyle").fontFamily ?? ""}
            onChange={(e) => {
              const value = e.target.value;
              if (!value) editor.chain().focus().unsetFontFamily().run();
              else editor.chain().focus().setFontFamily(value).run();
            }}
            className="h-7 text-xs text-slate-600 border border-slate-200 rounded bg-white px-1 max-w-[7.5rem]"
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f.label} value={f.value ?? ""}>
                {f.label}
              </option>
            ))}
          </select>

          <select
            title="Font size"
            aria-label="Font size"
            value={editor.getAttributes("textStyle").fontSize ?? ""}
            onChange={(e) => {
              const value = e.target.value;
              if (!value) editor.chain().focus().unsetFontSize().run();
              else editor.chain().focus().setFontSize(value).run();
            }}
            className="h-7 text-xs text-slate-600 border border-slate-200 rounded bg-white px-1 w-16"
          >
            {FONT_SIZES.map((s) => (
              <option key={s.label} value={s.value ?? ""}>
                {s.label}
              </option>
            ))}
          </select>

          <span className="w-px h-4 bg-slate-200 mx-1.5" />

          <ToolbarButton
            label="Insert table"
            active={editor.isActive("table")}
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="4" width="18" height="16" rx="1" />
              <path strokeLinecap="round" d="M3 10h18M3 16h18M9 4v16M15 4v16" />
            </svg>
          </ToolbarButton>
          {editor.isActive("table") && (
            <>
              <ToolbarButton label="Add row" active={false} onClick={() => editor.chain().focus().addRowAfter().run()}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v10m0 0l-3-3m3 3l3-3M4 20h16" />
                </svg>
              </ToolbarButton>
              <ToolbarButton label="Delete row" active={false} onClick={() => editor.chain().focus().deleteRow().run()}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 20v-10m0 0l-3 3m3-3l3 3M4 4h16" />
                </svg>
              </ToolbarButton>
              <ToolbarButton label="Add column" active={false} onClick={() => editor.chain().focus().addColumnAfter().run()}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h10m0 0l-3-3m3 3l-3 3M20 4v16" />
                </svg>
              </ToolbarButton>
              <ToolbarButton label="Delete column" active={false} onClick={() => editor.chain().focus().deleteColumn().run()}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H10m0 0l3-3m-3 3l3 3M4 4v16" />
                </svg>
              </ToolbarButton>
              <ToolbarButton label="Delete table" active={false} onClick={() => editor.chain().focus().deleteTable().run()}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </ToolbarButton>
            </>
          )}

          <span className="w-px h-4 bg-slate-200 mx-1.5" />

          <ToolbarButton label="Insert image" active={false} onClick={onInsertImageClick}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21" />
            </svg>
          </ToolbarButton>

          <span className="w-px h-4 bg-slate-200 mx-1.5" />

          <ToolbarButton label="Import .docx" active={false} onClick={onImportClick}>
            {importing ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
              </svg>
            )}
          </ToolbarButton>

          <span className="w-px h-4 bg-slate-200 mx-1.5" />

          <ToolbarButton label="Add comment" active={false} onClick={onAddComment}>
            <svg
              className={`w-4 h-4 ${hasSelection ? "" : "opacity-40"}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </ToolbarButton>
        </>
      )}
      {!editable && <span className="text-[11px] text-slate-400 font-medium">Viewing (read-only)</span>}

      <span className="w-px h-4 bg-slate-200 mx-1.5" />

      <ToolbarButton label="Export .docx" active={false} onClick={onExportDocx}>
        {exporting ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V3m0 12l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
          </svg>
        )}
      </ToolbarButton>
      <ToolbarButton label="Export PDF" active={false} onClick={onExportPdf}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h9l5 5v2M6 18H4a1 1 0 01-1-1v-5a1 1 0 011-1h16a1 1 0 011 1v5a1 1 0 01-1 1h-2M6 14h12M6 18v4h12v-4" />
        </svg>
      </ToolbarButton>

      <span className="w-px h-4 bg-slate-200 mx-1.5" />

      <ToolbarButton label="Highlight authorship" active={showAuthorship} onClick={onToggleAuthorship}>
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      </ToolbarButton>

      <ToolbarButton label="Comments" active={showComments} onClick={onToggleComments}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </ToolbarButton>

      <span className="text-[11px] text-slate-400 whitespace-nowrap pl-1">
        {wordCount} word{wordCount === 1 ? "" : "s"} · {charCount} char{charCount === 1 ? "" : "s"}
      </span>

      <div className="ml-auto flex items-center gap-2 pl-2 shrink-0">
        {statusLabel && (
          <span className={`text-[11px] ${connStatus === "connecting" ? "text-slate-400" : "text-amber-500"}`}>
            {statusLabel}
          </span>
        )}
        {presentUsers.length > 0 && (
          <div className="flex items-center -space-x-1.5">
            {presentUsers.map((u) => (
              <PresenceChip key={u.clientId} user={u} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
