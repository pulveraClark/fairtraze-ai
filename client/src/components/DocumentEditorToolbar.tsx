import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import type { AuthorshipUser } from "../lib/authorshipHighlight";
import { getUserColor } from "../lib/collabColors";
import { DocsDataApproximateNotice } from "./DocsDataApproximateNotice";

export type ConnStatus = "connecting" | "connected" | "disconnected";

export interface PresentUser {
  clientId: number;
  name: string;
  color: string;
}

export const ToolbarButton = forwardRef<
  HTMLButtonElement,
  { onClick: () => void; active: boolean; label: string; children: React.ReactNode; disabled?: boolean }
>(function ToolbarButton({ onClick, active, label, children, disabled }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`w-8 h-8 shrink-0 rounded flex items-center justify-center text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
          : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
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

const LINE_HEIGHTS: { label: string; value: string | null }[] = [
  { label: "Default", value: null },
  { label: "Single", value: "1" },
  { label: "1.5", value: "1.5" },
  { label: "Double", value: "2" },
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

function ImportIcon({ spinning }: { spinning: boolean }) {
  if (spinning) {
    return (
      <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
    );
  }
  // Arrow points UP out of the tray ("bring a file in") — deliberately the mirror of
  // ExportIcon's arrow below, so the two read as opposites, not near-twins. Previously this
  // used the exact same path as ExportIcon, which was the reported icon-collision bug.
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V3m0 0l-4 4m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
    </svg>
  );
}

function ExportIcon({ spinning }: { spinning: boolean }) {
  if (spinning) {
    return (
      <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
    );
  }
  // Arrow points DOWN into the tray ("send a file out") — unchanged from before; this one was
  // already the correct glyph, ImportIcon was wrongly duplicating it.
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V3m0 12l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
    </svg>
  );
}

// Dropdown positioning/outside-click/portal mechanics shared by the "More tools" menu below.
// Portaled to document.body for the same reason the old ColorMenu was: the toolbar row's
// overflow-x-auto computes overflow-y as auto too per the CSS spec, which silently clips an
// absolutely positioned dropdown nested inside it.
function useToolbarDropdown() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  return { open, setOpen, pos, btnRef, menuRef };
}

// Purpose-named dropdown buttons ("Table", "Format", "File") replace what used to be one generic
// "⋯ More tools" button hiding all three categories undifferentiated. Each still uses the same
// proven useToolbarDropdown()/portal mechanics — this is a parameterization of that pattern, not
// a new one — and each is a short text-labeled trigger (via MenuTriggerButton) rather than a bare
// icon, so a user doesn't have to guess what's behind it.
const MenuTriggerButton = forwardRef<
  HTMLButtonElement,
  { onClick: () => void; active: boolean; label: string }
>(function MenuTriggerButton({ onClick, active, label }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={active}
      className={`h-8 px-2 rounded flex items-center gap-1 text-xs font-semibold transition-colors shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 ${
        active
          ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
          : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
      }`}
    >
      {label}
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
});

function DropdownPanel({
  pos,
  menuRef,
  children,
}: {
  pos: { top: number; left: number };
  menuRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  return createPortal(
    <div
      ref={menuRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
      className="w-60 p-2 bg-white border border-slate-200 rounded-lg shadow-md text-xs"
    >
      {children}
    </div>,
    document.body
  );
}

// Text+icon row used inside a dropdown panel. `disabled` renders the row visibly (greyed, no
// hover) rather than omitting it — used by the Table menu so row/column operations stay
// discoverable even when the cursor isn't currently inside a table.
function MenuItemButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className={`w-full flex items-center gap-2 px-1.5 py-1.5 rounded ${
        disabled ? "text-slate-300 cursor-not-allowed" : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// Always visible (not conditional on cursor position) so table editing is discoverable even
// before/after the cursor is inside a table — row/column operations are shown disabled rather
// than omitted when there's no table at the cursor, instead of vanishing entirely as they used to.
function TableMenu({ editor, inline = false }: { editor: Editor; inline?: boolean }) {
  const { open, setOpen, pos, btnRef, menuRef } = useToolbarDropdown();
  const close = () => setOpen(false);
  const inTable = editor.isActive("table");

  const body = (
    <>
          <MenuItemButton
            label="Insert table"
            onClick={() => {
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
              close();
            }}
            icon={
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="4" width="18" height="16" rx="1" />
                <path strokeLinecap="round" d="M3 10h18M3 16h18M9 4v16M15 4v16" />
              </svg>
            }
          />
          <div className="border-t border-slate-100 my-1" />
          <MenuItemButton
            label="Add row"
            disabled={!inTable}
            onClick={() => {
              editor.chain().focus().addRowAfter().run();
              close();
            }}
            icon={
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v10m0 0l-3-3m3 3l3-3M4 20h16" />
              </svg>
            }
          />
          <MenuItemButton
            label="Delete row"
            disabled={!inTable}
            onClick={() => {
              editor.chain().focus().deleteRow().run();
              close();
            }}
            icon={
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 20v-10m0 0l-3 3m3-3l3 3M4 4h16" />
              </svg>
            }
          />
          <MenuItemButton
            label="Add column"
            disabled={!inTable}
            onClick={() => {
              editor.chain().focus().addColumnAfter().run();
              close();
            }}
            icon={
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h10m0 0l-3-3m3 3l-3 3M20 4v16" />
              </svg>
            }
          />
          <MenuItemButton
            label="Delete column"
            disabled={!inTable}
            onClick={() => {
              editor.chain().focus().deleteColumn().run();
              close();
            }}
            icon={
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H10m0 0l3-3m-3 3l3 3M4 4v16" />
              </svg>
            }
          />
          <MenuItemButton
            label="Delete table"
            disabled={!inTable}
            onClick={() => {
              editor.chain().focus().deleteTable().run();
              close();
            }}
            icon={
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            }
          />
    </>
  );
  if (inline) return body;

  return (
    <>
      <MenuTriggerButton ref={btnRef} label="Table" active={open} onClick={() => setOpen((v) => !v)} />
      {open && pos && (
        <DropdownPanel pos={pos} menuRef={menuRef}>
          {body}
        </DropdownPanel>
      )}
    </>
  );
}

// Text color/highlight/family/size/spacing — only ever shown when editable (read-only viewers
// have nothing to format).
function FormatMenu({ editor, inline = false }: { editor: Editor; inline?: boolean }) {
  const { open, setOpen, pos, btnRef, menuRef } = useToolbarDropdown();

  const body = (
    <>
          <div className="px-1.5 pb-1.5 flex items-center gap-2">
                <span className="text-slate-500 w-14 shrink-0">Text color</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="Clear"
                    aria-label="Clear text color"
                    onClick={() => editor.chain().focus().unsetColor().run()}
                    className="w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center text-slate-400 hover:bg-slate-50 text-xs shrink-0"
                  >
                    ✕
                  </button>
                  {FONT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      title={c}
                      aria-label={`Text color ${c}`}
                      onClick={() => editor.chain().focus().setColor(c).run()}
                      className={`w-4 h-4 rounded-full border shrink-0 ${
                        editor.getAttributes("textStyle").color === c ? "ring-2 ring-offset-1 ring-indigo-400" : "border-slate-200"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="px-1.5 pb-2 flex items-center gap-2">
                <span className="text-slate-500 w-14 shrink-0">Highlight</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="Clear"
                    aria-label="Clear highlight"
                    onClick={() => editor.chain().focus().unsetHighlight().run()}
                    className="w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center text-slate-400 hover:bg-slate-50 text-xs shrink-0"
                  >
                    ✕
                  </button>
                  {HIGHLIGHT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      title={c}
                      aria-label={`Highlight ${c}`}
                      onClick={() => editor.chain().focus().toggleHighlight({ color: c }).run()}
                      className={`w-4 h-4 rounded-full border shrink-0 ${
                        editor.getAttributes("highlight").color === c ? "ring-2 ring-offset-1 ring-indigo-400" : "border-slate-200"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="px-1.5 pb-1.5 flex items-center gap-2">
                <span className="text-slate-500 w-14 shrink-0">Font</span>
                <select
                  title="Font family"
                  aria-label="Font family"
                  value={editor.getAttributes("textStyle").fontFamily ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) editor.chain().focus().unsetFontFamily().run();
                    else editor.chain().focus().setFontFamily(value).run();
                  }}
                  className="h-6 text-xs text-slate-600 border border-slate-200 rounded bg-white px-1 flex-1 min-w-0"
                >
                  {FONT_FAMILIES.map((f) => (
                    <option key={f.label} value={f.value ?? ""}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="px-1.5 pb-2 flex items-center gap-2">
                <span className="text-slate-500 w-14 shrink-0">Size</span>
                <select
                  title="Font size"
                  aria-label="Font size"
                  value={editor.getAttributes("textStyle").fontSize ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) editor.chain().focus().unsetFontSize().run();
                    else editor.chain().focus().setFontSize(value).run();
                  }}
                  className="h-6 text-xs text-slate-600 border border-slate-200 rounded bg-white px-1 flex-1 min-w-0"
                >
                  {FONT_SIZES.map((s) => (
                    <option key={s.label} value={s.value ?? ""}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="px-1.5 pb-2 flex items-center gap-2">
                <span className="text-slate-500 w-14 shrink-0">Spacing</span>
                <select
                  title="Line spacing"
                  aria-label="Line spacing"
                  value={editor.getAttributes("textStyle").lineHeight ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) editor.chain().focus().unsetLineHeight().run();
                    else editor.chain().focus().setLineHeight(value).run();
                  }}
                  className="h-6 text-xs text-slate-600 border border-slate-200 rounded bg-white px-1 flex-1 min-w-0"
                >
                  {LINE_HEIGHTS.map((s) => (
                    <option key={s.label} value={s.value ?? ""}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
    </>
  );
  if (inline) return body;

  return (
    <>
      <MenuTriggerButton ref={btnRef} label="Format" active={open} onClick={() => setOpen((v) => !v)} />
      {open && pos && (
        <DropdownPanel pos={pos} menuRef={menuRef}>
          {body}
        </DropdownPanel>
      )}
    </>
  );
}

// Import/export/print — always rendered (Export/Print must stay reachable for an instructor
// without edit rights); Import is hidden internally when !editable, same as before the split.
function FileMenu({
  editable,
  importing,
  onImportClick,
  exporting,
  onExportDocx,
  onExportPdf,
}: {
  editable: boolean;
  importing: boolean;
  onImportClick: () => void;
  exporting: boolean;
  onExportDocx: () => void;
  onExportPdf: () => void;
}) {
  const { open, setOpen, pos, btnRef, menuRef } = useToolbarDropdown();
  const close = () => setOpen(false);

  return (
    <>
      <MenuTriggerButton ref={btnRef} label="File" active={open} onClick={() => setOpen((v) => !v)} />
      {open && pos && (
        <DropdownPanel pos={pos} menuRef={menuRef}>
          {editable && (
            <MenuItemButton
              label="Import .docx"
              icon={<ImportIcon spinning={importing} />}
              onClick={() => {
                onImportClick();
                close();
              }}
            />
          )}
          <MenuItemButton
            label="Export .docx"
            icon={<ExportIcon spinning={exporting} />}
            onClick={() => {
              onExportDocx();
              close();
            }}
          />
          <MenuItemButton
            label="Export PDF"
            icon={
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h9l5 5v2M6 18H4a1 1 0 01-1-1v-5a1 1 0 011-1h16a1 1 0 011 1v5a1 1 0 01-1 1h-2M6 14h12M6 18v4h12v-4" />
              </svg>
            }
            onClick={() => {
              onExportPdf();
              close();
            }}
          />
        </DropdownPanel>
      )}
    </>
  );
}

export function PresenceChip({ user }: { user: PresentUser }) {
  const initial = user.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      title={user.name}
      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ring-2 ring-white"
      style={{ backgroundColor: user.color }}
    >
      {initial}
    </span>
  );
}

export function AuthorshipLegend({
  users,
  memberIds,
  approximate = false,
  fixedAt,
}: {
  users: AuthorshipUser[];
  memberIds: number[];
  approximate?: boolean;
  fixedAt?: string | null;
}) {
  if (users.length === 0) return null;
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 border-b border-slate-100 bg-slate-50/60 flex-wrap">
      {users.map((u) => (
        <span key={u.id} className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getUserColor(u.id, memberIds) }} />
          {u.name}
        </span>
      ))}
      {approximate && <DocsDataApproximateNotice fixedAt={fixedAt} className="basis-full" />}
    </div>
  );
}

const Divider = () => <span className="w-px h-5 bg-slate-300 mx-1.5 shrink-0" aria-hidden="true" />;

const Icon = ({ d }: { d: string }) => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

// Container-width breakpoints (the toolbar's own width, not the viewport — the editor sits beside
// panels). As the toolbar narrows, groups move into the "More" menu in this order: Review, Insert,
// Paragraph, Formatting, then the View buttons. File, History and Text style always stay inline.
function overflowFor(width: number) {
  return {
    review: width < 1180,
    insert: width < 1060,
    paragraph: width < 940,
    formatting: width < 820,
    view: width < 520,
    showCount: width >= 760,
    showPresence: width >= 640,
  };
}

function MoreMenu({ children }: { children: React.ReactNode }) {
  const { open, setOpen, pos, btnRef, menuRef } = useToolbarDropdown();
  return (
    <>
      <MenuTriggerButton ref={btnRef} label="More" active={open} onClick={() => setOpen((v) => !v)} />
      {open && pos && (
        <DropdownPanel pos={{ top: pos.top, left: Math.max(8, Math.min(pos.left, window.innerWidth - 248)) }} menuRef={menuRef}>
          {children}
        </DropdownPanel>
      )}
    </>
  );
}

function MoreSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pb-2 mb-2 border-b border-slate-100 last:border-0 last:pb-0 last:mb-0">
      <p className="px-1.5 pb-1 text-xs font-semibold text-slate-600">{title}</p>
      <div className="flex flex-wrap items-center gap-0.5">{children}</div>
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
  showToc,
  onToggleToc,
  hasSelection,
  focusMode,
  onToggleFocusMode,
  pageSize,
  onChangePageSize,
  zoom,
  onChangeZoom,
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
  showToc: boolean;
  onToggleToc: () => void;
  hasSelection: boolean;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  pageSize: "short" | "long";
  onChangePageSize: (size: "short" | "long") => void;
  zoom: number;
  onChangeZoom: (zoom: number) => void;
}) {
  const statusLabel = connStatus === "connected" ? "" : connStatus === "connecting" ? "Connecting…" : "Reconnecting…";
  const wordCount = editor.storage.characterCount?.words?.() ?? 0;
  const charCount = editor.storage.characterCount?.characters?.() ?? 0;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(1200);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setWidth(el.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const ov = overflowFor(width);

  const textStyleValue = editor.isActive("heading", { level: 1 })
    ? "h1"
    : editor.isActive("heading", { level: 2 })
      ? "h2"
      : "p";

  // ── Groups. Each is a plain JSX value so the identical buttons render inline or inside "More". ──
  const history = (
    <>
      <ToolbarButton label="Undo" active={false} disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
        <Icon d="M3 10h10a5 5 0 010 10H9M3 10l4-4m-4 4l4 4" />
      </ToolbarButton>
      <ToolbarButton label="Redo" active={false} disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
        <Icon d="M21 10H11a5 5 0 000 10h4m6-10l-4-4m4 4l-4 4" />
      </ToolbarButton>
    </>
  );

  const textStyle = (
    <select
      title="Text style"
      aria-label="Text style"
      value={textStyleValue}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "p") editor.chain().focus().setParagraph().run();
        else editor.chain().focus().setHeading({ level: v === "h1" ? 1 : 2 }).run();
      }}
      className="h-8 text-xs text-slate-700 border border-slate-300 rounded bg-white px-1.5 w-[7.5rem] shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
    >
      <option value="p">Normal text</option>
      <option value="h1">Heading 1</option>
      <option value="h2">Heading 2</option>
    </select>
  );

  const formattingButtons = (
    <>
      <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        B
      </ToolbarButton>
      <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <span className="italic">I</span>
      </ToolbarButton>
      <ToolbarButton label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <span className="underline">U</span>
      </ToolbarButton>
      <ToolbarButton label="Superscript" active={editor.isActive("superscript")} onClick={() => editor.chain().focus().toggleSuperscript().run()}>
        <span className="text-xs">x<sup>2</sup></span>
      </ToolbarButton>
      <ToolbarButton label="Subscript" active={editor.isActive("subscript")} onClick={() => editor.chain().focus().toggleSubscript().run()}>
        <span className="text-xs">x<sub>2</sub></span>
      </ToolbarButton>
    </>
  );

  const paragraph = (
    <>
      <ToolbarButton label="Align left" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
        <Icon d="M4 6h16M4 12h10M4 18h13" />
      </ToolbarButton>
      <ToolbarButton label="Align center" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
        <Icon d="M4 6h16M7 12h10M5.5 18h13" />
      </ToolbarButton>
      <ToolbarButton label="Align right" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
        <Icon d="M4 6h16M10 12h10M7 18h13" />
      </ToolbarButton>
      <ToolbarButton label="Bulleted list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <Icon d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
      </ToolbarButton>
      <ToolbarButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <Icon d="M8 6h13M8 12h13M8 18h13M4 6h1v2M4 10h2l-2 2h2M4 18h2M4 16h2" />
      </ToolbarButton>
    </>
  );

  const imageButton = (
    <ToolbarButton label="Insert image" active={false} onClick={onInsertImageClick}>
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21" />
      </svg>
    </ToolbarButton>
  );

  // Bubble-with-plus, deliberately distinct from the plain-bubble "Comments" panel toggle.
  const commentButton = (
    <ToolbarButton label="Add comment" active={false} onClick={onAddComment}>
      <svg className={`w-4 h-4 ${hasSelection ? "" : "opacity-40"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m-2-2h4M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    </ToolbarButton>
  );

  const viewButtons = (
    <>
      <ToolbarButton label="Highlight authorship" active={showAuthorship} onClick={onToggleAuthorship}>
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      </ToolbarButton>
      <ToolbarButton label="Comments" active={showComments} onClick={onToggleComments}>
        <Icon d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </ToolbarButton>
      <ToolbarButton label="Table of contents" active={showToc} onClick={onToggleToc}>
        <Icon d="M4 6h16M4 12h10M4 18h7" />
      </ToolbarButton>
      <ToolbarButton label={focusMode ? "Exit full screen" : "Full screen"} active={focusMode} onClick={onToggleFocusMode}>
        {focusMode ? (
          <Icon d="M9 4v4a1 1 0 01-1 1H4M4 9V4m0 5l6-6m9 1v4a1 1 0 001 1h4m0-5v4m0-4l-6 6M15 20v-4a1 1 0 011-1h4M20 15v5m0-5l-6 6M9 20v-4a1 1 0 00-1-1H4m5 5v-5m0 5l-6-6" />
        ) : (
          <Icon d="M4 8V5a1 1 0 011-1h3M20 8V5a1 1 0 00-1-1h-3M4 16v3a1 1 0 001 1h3M20 16v3a1 1 0 01-1 1h-3" />
        )}
      </ToolbarButton>
    </>
  );

  const segmented = (label: string, children: React.ReactNode) => (
    <div className="flex items-center rounded border border-slate-300 overflow-hidden ml-1 shrink-0" role="group" aria-label={label}>
      {children}
    </div>
  );
  const segBtn = (active: boolean) =>
    `px-2 h-8 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 ${
      active ? "bg-indigo-100 text-indigo-700" : "bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
    }`;

  const moreSections: React.ReactNode[] = [];
  if (editable) {
    if (ov.formatting) {
      moreSections.push(
        <MoreSection key="fmt" title="Formatting">
          {formattingButtons}
          <div className="w-full pt-1"><FormatMenu editor={editor} inline /></div>
        </MoreSection>
      );
    }
    if (ov.paragraph) moreSections.push(<MoreSection key="para" title="Paragraph">{paragraph}</MoreSection>);
    if (ov.insert) {
      moreSections.push(
        <MoreSection key="ins" title="Insert">
          {imageButton}
          <div className="w-full pt-1"><TableMenu editor={editor} inline /></div>
        </MoreSection>
      );
    }
    if (ov.review) moreSections.push(<MoreSection key="rev" title="Review">{commentButton}</MoreSection>);
  }
  if (ov.view) moreSections.push(<MoreSection key="view" title="View">{viewButtons}</MoreSection>);

  return (
    <div ref={rootRef} className="flex flex-nowrap items-center gap-0.5 px-3 py-2 border-b border-slate-100 bg-slate-50 min-w-0">
      {/* File: always reachable, including read-only (Export/Print for an instructor). */}
      <FileMenu
        editable={editable}
        importing={importing}
        onImportClick={onImportClick}
        exporting={exporting}
        onExportDocx={onExportDocx}
        onExportPdf={onExportPdf}
      />

      {editable ? (
        <>
          <Divider />
          {history}
          <Divider />
          {textStyle}
          {!ov.formatting && (
            <>
              <Divider />
              {formattingButtons}
              <FormatMenu editor={editor} />
            </>
          )}
          {!ov.paragraph && (
            <>
              <Divider />
              {paragraph}
            </>
          )}
          {!ov.insert && (
            <>
              <Divider />
              <TableMenu editor={editor} />
              {imageButton}
            </>
          )}
          {!ov.review && (
            <>
              <Divider />
              {commentButton}
            </>
          )}
        </>
      ) : (
        <>
          <Divider />
          <span className="text-xs text-slate-600 font-medium whitespace-nowrap">Viewing (read-only)</span>
        </>
      )}

      {moreSections.length > 0 && (
        <>
          <Divider />
          <MoreMenu>{moreSections}</MoreMenu>
        </>
      )}

      {/* View: right side — authorship colors, comments panel, outline, focus mode, then counts + presence. */}
      <div className="ml-auto flex items-center gap-0.5 pl-2 shrink-0">
        {!ov.view && (
          <>
            {viewButtons}
            {focusMode &&
              segmented(
                "Paper size",
                (["short", "long"] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    title={size === "short" ? "Short — 8.5×11in" : "Long — 8.5×13in"}
                    aria-label={size === "short" ? "Short paper — 8.5×11in" : "Long paper — 8.5×13in"}
                    onClick={() => onChangePageSize(size)}
                    className={`${segBtn(pageSize === size)} capitalize`}
                  >
                    {size}
                  </button>
                ))
              )}
            {focusMode &&
              segmented(
                "Zoom",
                [0.75, 1, 1.25].map((level) => (
                  <button
                    key={level}
                    type="button"
                    title={`${Math.round(level * 100)}%`}
                    aria-label={`Zoom ${Math.round(level * 100)}%`}
                    onClick={() => onChangeZoom(level)}
                    className={segBtn(zoom === level)}
                  >
                    {Math.round(level * 100)}%
                  </button>
                ))
              )}
          </>
        )}
        {ov.showCount && (
          <span className="text-xs text-slate-600 whitespace-nowrap pl-2 tabular-nums">
            {wordCount} word{wordCount === 1 ? "" : "s"} · {charCount} char{charCount === 1 ? "" : "s"}
          </span>
        )}
        {statusLabel && (
          <span className={`text-xs pl-2 whitespace-nowrap ${connStatus === "connecting" ? "text-slate-600" : "text-amber-700"}`}>
            {statusLabel}
          </span>
        )}
        {ov.showPresence && presentUsers.length > 0 && (
          <div className="flex items-center -space-x-1.5 pl-2">
            {presentUsers.map((u) => (
              <PresenceChip key={u.clientId} user={u} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
