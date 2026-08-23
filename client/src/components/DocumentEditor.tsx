import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { useAuth } from "../context/AuthContext";
import { getUserColor } from "../lib/collabColors";
import { CollaborationCursor } from "../lib/collaborationCursor";
import { AuthorshipHighlight, authorshipPluginKey } from "../lib/authorshipHighlight";
import type { AuthorshipUpdate, AuthorshipUser } from "../lib/authorshipHighlight";
import { CommentHighlight, commentHighlightPluginKey } from "../lib/commentHighlight";
import type { CommentDecorationRange } from "../lib/commentHighlight";
import { encodeCommentAnchor, decodeCommentAnchor } from "../lib/commentAnchor";
import { CommentPanel } from "./CommentPanel";
import type { CommentRecord } from "./CommentPanel";

interface Props {
  groupId: number;
  editable: boolean; // false = instructor read-only/observer view, true = member edit view
  // Set only right after THIS session created the document (see DocumentGate.tsx) — the number of
  // top-level nodes its initial content (a template, or 0 for blank) should produce once the
  // fresh room's Yjs sync lands. While the doc's actual node count is below this, the editor stays
  // non-editable so a fast typist can't land text ahead of content still arriving asynchronously
  // (see DocumentEditor.tsx's AWAIT_INITIAL_CONTENT_TIMEOUT_MS comment for why `provider.synced`
  // alone can't be used for this). Undefined (the normal reopen path) skips this entirely.
  awaitInitialNodeCount?: number;
}

type ConnStatus = "connecting" | "connected" | "disconnected";

interface PresentUser {
  clientId: number;
  name: string;
  color: string;
}

interface CollabHandle {
  groupId: number;
  ydoc: Y.Doc;
  provider: WebsocketProvider;
}

function wsUrl(path: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
}

const ToolbarButton = forwardRef<
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

function PresenceChip({ user }: { user: PresentUser }) {
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

function AuthorshipLegend({ users }: { users: AuthorshipUser[] }) {
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

const MAX_DOCX_BYTES = 5 * 1024 * 1024; // 5MB — must match server/src/routes/documents.ts's MAX_DOCX_BYTES

// Safety net for awaitInitialNodeCount below: y-websocket's server-side getYDoc() calls
// persistence.bindState() without awaiting it, so a freshly-created room's initial sync (which
// flips WebsocketProvider's `synced` to true) can complete before bindState's migrated content
// actually lands in the doc — `synced` alone is not a reliable "content has arrived" signal for a
// fresh room. This timeout just bounds the worst case (unusually slow sync) so typing is never
// blocked indefinitely; it never fires in the common case, where the content check below resolves
// almost immediately.
const AWAIT_INITIAL_CONTENT_TIMEOUT_MS = 5000;

function Toolbar({
  editor,
  editable,
  connStatus,
  presentUsers,
  showAuthorship,
  onToggleAuthorship,
  onImportClick,
  importing,
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
  onExportDocx: () => void;
  exporting: boolean;
  onExportPdf: () => void;
  showComments: boolean;
  onToggleComments: () => void;
  onAddComment: () => void;
  hasSelection: boolean;
}) {
  const statusLabel = connStatus === "connected" ? "" : connStatus === "connecting" ? "Connecting…" : "Reconnecting…";

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

export function DocumentEditor({ groupId, editable, awaitInitialNodeCount }: Props) {
  const { token, user } = useAuth();
  const collabRef = useRef<CollabHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const printContentRef = useRef<HTMLDivElement | null>(null);
  const [connStatus, setConnStatus] = useState<ConnStatus>("connecting");
  const [presentUsers, setPresentUsers] = useState<PresentUser[]>([]);
  const [awaitingInitialContent, setAwaitingInitialContent] = useState(awaitInitialNodeCount !== undefined);
  // Read-only (instructor/observer) views default to showing authorship, since reviewing who
  // wrote what is the point of viewing read-only; the editable (member) view defaults off so
  // it doesn't distract from active writing.
  const [showAuthorship, setShowAuthorship] = useState(!editable);
  const [authorshipUsers, setAuthorshipUsers] = useState<AuthorshipUser[]>([]);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<{ from: number; to: number } | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  // Extension options are captured at construction time by TipTap and don't hot-update, so the
  // click handler goes through a ref instead — kept current every render, called from inside the
  // (effectively static) CommentHighlight extension instance.
  const onCommentClickRef = useRef<(commentId: number) => void>(() => {});
  onCommentClickRef.current = (commentId: number) => {
    setActiveThreadId(commentId);
    setShowComments(true);
  };

  // Lazily (re)create the Yjs doc + WebSocket provider whenever groupId changes,
  // tearing down the previous room's connection first. Avoided in an effect so the
  // editor never has to render once without a bound Yjs document (no "flash").
  if ((!collabRef.current || collabRef.current.groupId !== groupId) && token) {
    collabRef.current?.provider.destroy();
    collabRef.current?.ydoc.destroy();

    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(wsUrl("/collab"), `group-doc-${groupId}`, ydoc, {
      params: { token },
    });
    collabRef.current = { groupId, ydoc, provider };
  }

  const collab = collabRef.current;

  // Final cleanup on unmount.
  useEffect(() => {
    return () => {
      collabRef.current?.provider.destroy();
      collabRef.current?.ydoc.destroy();
      collabRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!collab || !user) return;

    const { provider } = collab;
    const awareness = provider.awareness;
    awareness.setLocalStateField("user", { name: user.name, color: getUserColor(user.id) });

    const updatePresence = () => {
      const states = Array.from(awareness.getStates().entries()) as [number, { user?: { name: string; color: string } }][];
      setPresentUsers(
        states
          .filter(([, state]) => !!state.user)
          .map(([clientId, state]) => ({ clientId, name: state.user!.name, color: state.user!.color }))
      );
    };
    updatePresence();
    awareness.on("change", updatePresence);

    const handleStatus = ({ status }: { status: ConnStatus }) => setConnStatus(status);
    provider.on("status", handleStatus);
    setConnStatus("connecting");

    return () => {
      awareness.off("change", updatePresence);
      provider.off("status", handleStatus);
    };
  }, [collab, user]);

  // Only armed right after this session created the document (awaitInitialNodeCount set — see
  // DocumentGate.tsx). Waits for the fresh room's Yjs sync to actually deliver its initial content
  // (checked directly against the doc, not against WebsocketProvider's `synced` event — see
  // AWAIT_INITIAL_CONTENT_TIMEOUT_MS above for why that signal isn't reliable here) before letting
  // the editor accept input, so a fast typist can't land text ahead of content still arriving.
  useEffect(() => {
    if (!collab || awaitInitialNodeCount === undefined) {
      setAwaitingInitialContent(false);
      return;
    }

    const fragment = collab.ydoc.getXmlFragment("default");
    const isReady = () => fragment.length >= awaitInitialNodeCount;

    if (isReady()) {
      setAwaitingInitialContent(false);
      return;
    }

    setAwaitingInitialContent(true);
    const onUpdate = () => {
      if (isReady()) {
        setAwaitingInitialContent(false);
        collab.ydoc.off("update", onUpdate);
      }
    };
    collab.ydoc.on("update", onUpdate);
    const timeout = setTimeout(() => {
      setAwaitingInitialContent(false);
      collab.ydoc.off("update", onUpdate);
    }, AWAIT_INITIAL_CONTENT_TIMEOUT_MS);

    return () => {
      collab.ydoc.off("update", onUpdate);
      clearTimeout(timeout);
    };
  }, [collab, awaitInitialNodeCount]);

  const effectiveEditable = editable && !awaitingInitialContent;

  const editor = useEditor(
    {
      extensions: collab
        ? [
            StarterKit.configure({ undoRedo: false }),
            Collaboration.configure({ document: collab.ydoc }),
            CollaborationCursor.configure({
              provider: collab.provider,
              user: { name: user?.name ?? "Unknown", color: getUserColor(user?.id ?? 0) },
            }),
            AuthorshipHighlight,
            CommentHighlight.configure({
              onCommentClick: (commentId: number) => onCommentClickRef.current(commentId),
            }),
            Table.configure({ resizable: true }),
            TableRow,
            TableHeader,
            TableCell,
            TextAlign.configure({ types: ["heading", "paragraph"] }),
            TextStyle,
            Color,
            Highlight.configure({ multicolor: true }),
          ]
        : [StarterKit],
      editable: effectiveEditable,
      editorProps: {
        attributes: {
          class: "ft-doc-content px-8 py-6 text-base leading-relaxed text-slate-700 min-h-[20rem]",
        },
      },
      onSelectionUpdate: ({ editor: e }) => {
        setHasSelection(!e.state.selection.empty);
      },
    },
    [collab]
  );

  // Keep TipTap's editable state in sync — it isn't reactive to the initial option alone.
  useEffect(() => {
    editor?.setEditable(effectiveEditable);
  }, [editor, effectiveEditable]);

  // While the toggle is on: fetch the current authorship map once (immediate snapshot), then
  // open a dedicated push socket (separate from the Yjs sync socket — see
  // authorshipBroadcast.ts) for live updates as teammates edit.
  useEffect(() => {
    if (!editor || !token) return;

    if (!showAuthorship) {
      editor.view.dispatch(editor.state.tr.setMeta(authorshipPluginKey, null));
      setAuthorshipUsers([]);
      return;
    }

    let cancelled = false;
    const applyUpdate = (update: AuthorshipUpdate) => {
      if (cancelled) return;
      setAuthorshipUsers(update.users);
      editor.view.dispatch(editor.state.tr.setMeta(authorshipPluginKey, update));
    };

    fetch(`/api/groups/${groupId}/document/authorship`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? (res.json() as Promise<AuthorshipUpdate>) : null))
      .then((data) => {
        if (data) applyUpdate(data);
      })
      .catch((err) => console.error("[authorship] initial fetch failed", err));

    const ws = new WebSocket(
      `${wsUrl(`/collab-authorship/group-doc-${groupId}`)}?token=${encodeURIComponent(token)}`
    );
    ws.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data as string) as AuthorshipUpdate;
        applyUpdate(update);
      } catch (err) {
        console.error("[authorship] failed to parse push message", err);
      }
    };

    return () => {
      cancelled = true;
      ws.close();
    };
  }, [editor, showAuthorship, groupId, token]);

  // Fetch the comment list once per group/session. Unlike authorship, there's no live push
  // channel for other members' newly-added comments (out of scope for v1 — see the comments
  // feature plan) — the list refreshes on mount and after this session's own create/reply/
  // resolve/delete actions below.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`/api/groups/${groupId}/document/comments`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? (res.json() as Promise<{ comments: CommentRecord[] }>) : null))
      .then((data) => {
        if (!cancelled && data) setComments(data.comments);
      })
      .catch((err) => console.error("[comments] fetch failed", err));
    return () => {
      cancelled = true;
    };
  }, [groupId, token]);

  // Re-resolves every comment's stored anchor against the CURRENT document on every Yjs update
  // (not just once) — anchors are content-relative, so a comment's highlighted range can shift as
  // other members edit around it, and must be recomputed rather than cached. A comment whose
  // anchored text was deleted entirely resolves to null and is simply skipped here (dropped from
  // the inline highlight only — it still renders in the side panel, per the documented "known
  // limitation": nothing is silently lost, only the in-text highlight goes away).
  useEffect(() => {
    if (!editor || !collab) return;

    const applyDecorations = () => {
      const ranges: CommentDecorationRange[] = [];
      for (const c of comments) {
        const resolved = decodeCommentAnchor(editor.state, c.anchor);
        if (!resolved) continue;
        ranges.push({ commentId: c.id, from: resolved.start, to: resolved.end, resolved: !!c.resolvedAt });
      }
      editor.view.dispatch(editor.state.tr.setMeta(commentHighlightPluginKey, ranges));
    };

    applyDecorations();
    collab.ydoc.on("update", applyDecorations);
    return () => {
      collab.ydoc.off("update", applyDecorations);
    };
  }, [editor, collab, comments]);

  const handleAddCommentClick = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    setPendingSelection({ from, to });
    setShowComments(true);
  };

  const handleSubmitNewComment = async (text: string) => {
    if (!editor || !token || !pendingSelection) return;
    const anchor = encodeCommentAnchor(editor.state, pendingSelection.from, pendingSelection.to);
    if (!anchor) return;
    const res = await fetch(`/api/groups/${groupId}/document/comments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text, anchor }),
    });
    if (res.ok) {
      const created = (await res.json()) as CommentRecord;
      setComments((prev) => [...prev, created]);
      setPendingSelection(null);
    }
  };

  const handleReply = async (parentId: number, text: string) => {
    if (!editor || !token) return;
    // Replies aren't independently anchored — they inherit the thread's anchor for display
    // purposes (the panel groups by parentId, not by anchor), so re-encode the root's own anchor.
    const parent = comments.find((c) => c.id === parentId);
    if (!parent) return;
    const res = await fetch(`/api/groups/${groupId}/document/comments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text, anchor: parent.anchor, parentId }),
    });
    if (res.ok) {
      const created = (await res.json()) as CommentRecord;
      setComments((prev) => [...prev, created]);
    }
  };

  const handleResolveToggle = async (commentId: number, resolved: boolean) => {
    if (!token) return;
    const res = await fetch(`/api/groups/${groupId}/document/comments/${commentId}/resolve`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ resolved }),
    });
    if (res.ok) {
      const updated = (await res.json()) as CommentRecord;
      setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!token) return;
    const res = await fetch(`/api/groups/${groupId}/document/comments/${commentId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setComments((prev) => prev.filter((c) => c.id !== commentId && c.parentId !== commentId));
    }
  };

  const handleSelectThread = (commentId: number) => {
    setActiveThreadId(commentId);
    const el = editor?.view.dom.querySelector(`[data-comment-id="${commentId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleImportClick = () => {
    if (importing) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file (or re-trying after an error)
    if (!file || !token) return;

    if (!/\.docx$/i.test(file.name)) {
      setImportMessage({ kind: "error", text: "Only .docx files are supported." });
      return;
    }
    if (file.size > MAX_DOCX_BYTES) {
      setImportMessage({
        kind: "error",
        text: `File is too large — the limit is ${MAX_DOCX_BYTES / (1024 * 1024)}MB.`,
      });
      return;
    }

    setImporting(true);
    setImportMessage(null);
    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string; // "data:<mime>;base64,<data>"
          resolve(result.slice(result.indexOf(",") + 1));
        };
        reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
        reader.readAsDataURL(file);
      });

      const res = await fetch(`/api/groups/${groupId}/document/import`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, fileBase64 }),
      });
      const data = (await res.json().catch(() => null)) as { chunkCount?: number; error?: string } | null;

      if (!res.ok) {
        setImportMessage({ kind: "error", text: data?.error ?? "Import failed." });
        return;
      }
      const count = data?.chunkCount ?? 0;
      setImportMessage({ kind: "success", text: `Imported ${count} section${count === 1 ? "" : "s"}.` });
    } catch (err) {
      console.error("[docx import] failed", err);
      setImportMessage({ kind: "error", text: "Import failed — check your connection and try again." });
    } finally {
      setImporting(false);
    }
  };

  const handleExportDocx = async () => {
    if (exporting || !token) return;
    setExporting(true);
    setImportMessage(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/document/export?format=docx`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setImportMessage({ kind: "error", text: data?.error ?? "Export failed." });
        return;
      }
      const blob = await res.blob();
      const contentDisposition = res.headers.get("Content-Disposition");
      const match = contentDisposition ? /filename="([^"]+)"/.exec(contentDisposition) : null;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = match ? match[1] : "document.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[docx export] failed", err);
      setImportMessage({ kind: "error", text: "Export failed — check your connection and try again." });
    } finally {
      setExporting(false);
    }
  };

  // PDF export reuses the exact print-driven pattern already proven for the fairness report
  // (PrintableReport.tsx: a hidden print:block view + window.print(), no new library). Because
  // this button lives inside the live editor, the document's already-synced TipTap content is
  // already in the DOM — editor.getHTML() hands that same content to the printable portal
  // verbatim, so this is purely a read of already-rendered content, never a write.
  //
  // Populated imperatively here (not via a JSX dangerouslySetInnerHTML computed at render time):
  // Yjs content updates land straight in ProseMirror's view state and never trigger a React
  // re-render of this component, so a JSX-computed snapshot would silently go stale (observed:
  // it stayed empty forever after the very first, pre-sync render). Reading editor.getHTML()
  // right here guarantees it reflects whatever's on screen at the moment of the click.
  const handleExportPdf = () => {
    if (printContentRef.current) printContentRef.current.innerHTML = editor?.getHTML() ?? "";
    document.body.classList.add("ft-printing-document");
    const cleanup = () => {
      document.body.classList.remove("ft-printing-document");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  };

  if (!editor) return null;

  const rootComments = comments.filter((c) => c.parentId === null);
  const repliesByParent = new Map<number, CommentRecord[]>();
  for (const c of comments) {
    if (c.parentId === null) continue;
    const list = repliesByParent.get(c.parentId) ?? [];
    list.push(c);
    repliesByParent.set(c.parentId, list);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <Toolbar
        editor={editor}
        editable={effectiveEditable}
        connStatus={connStatus}
        presentUsers={presentUsers}
        showAuthorship={showAuthorship}
        onToggleAuthorship={() => setShowAuthorship((v) => !v)}
        onImportClick={handleImportClick}
        importing={importing}
        onExportDocx={handleExportDocx}
        exporting={exporting}
        onExportPdf={handleExportPdf}
        showComments={showComments}
        onToggleComments={() => setShowComments((v) => !v)}
        onAddComment={handleAddCommentClick}
        hasSelection={hasSelection}
      />
      {awaitingInitialContent && (
        <div className="px-3 py-1.5 border-b border-slate-100 bg-slate-50/60 text-[11px] text-slate-400 font-medium">
          Loading document…
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleFileChange}
      />
      {importMessage && (
        <div
          className={`flex items-center justify-between gap-3 px-3 py-1.5 border-b text-[11px] ${
            importMessage.kind === "success"
              ? "bg-emerald-50 border-emerald-100 text-emerald-700"
              : "bg-red-50 border-red-100 text-red-700"
          }`}
        >
          <span>{importMessage.text}</span>
          <button
            type="button"
            onClick={() => setImportMessage(null)}
            className="opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      {showAuthorship && <AuthorshipLegend users={authorshipUsers} />}
      <div className="flex items-stretch">
        <div className="flex-1 min-w-0">
          <EditorContent editor={editor} />
        </div>
        {showComments && (
          <CommentPanel
            comments={comments}
            currentUserId={user?.id ?? -1}
            canModerate={!editable}
            pendingSelection={pendingSelection}
            onCancelPending={() => setPendingSelection(null)}
            onSubmitNew={handleSubmitNewComment}
            onReply={handleReply}
            onResolveToggle={handleResolveToggle}
            onDelete={handleDeleteComment}
            onSelectThread={handleSelectThread}
            activeThreadId={activeThreadId}
          />
        )}
      </div>
      {createPortal(
        <div className="hidden print:block px-8 py-6">
          <div className="ft-doc-content" ref={printContentRef} />
          {rootComments.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-bold mb-3">Comments</h2>
              {rootComments.map((c) => (
                <div key={c.id} className="mb-3">
                  <p className="text-sm font-semibold text-slate-700">
                    {c.author.name} — {new Date(c.createdAt).toLocaleString()} {c.resolvedAt ? "(resolved)" : "(open)"}
                  </p>
                  <p className="text-sm text-slate-700">{c.text}</p>
                  {(repliesByParent.get(c.id) ?? []).map((r) => (
                    <p key={r.id} className="text-sm text-slate-600 ml-4 mt-1">
                      ↳ {r.author.name}: {r.text}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
