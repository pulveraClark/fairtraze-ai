import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { useAuth } from "../context/AuthContext";
import { getUserColor } from "../lib/collabColors";
import { CollaborationCursor } from "../lib/collaborationCursor";
import { AuthorshipHighlight, authorshipPluginKey } from "../lib/authorshipHighlight";
import type { AuthorshipUpdate, AuthorshipUser } from "../lib/authorshipHighlight";

interface Props {
  groupId: number;
  editable: boolean; // false = instructor read-only/observer view, true = member edit view
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

function ToolbarButton({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
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

function Toolbar({
  editor,
  editable,
  connStatus,
  presentUsers,
  showAuthorship,
  onToggleAuthorship,
  onImportClick,
  importing,
}: {
  editor: Editor;
  editable: boolean;
  connStatus: ConnStatus;
  presentUsers: PresentUser[];
  showAuthorship: boolean;
  onToggleAuthorship: () => void;
  onImportClick: () => void;
  importing: boolean;
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
        </>
      )}
      {!editable && <span className="text-[11px] text-slate-400 font-medium">Viewing (read-only)</span>}

      <span className="w-px h-4 bg-slate-200 mx-1.5" />

      <ToolbarButton label="Highlight authorship" active={showAuthorship} onClick={onToggleAuthorship}>
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
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

export function DocumentEditor({ groupId, editable }: Props) {
  const { token, user } = useAuth();
  const collabRef = useRef<CollabHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [connStatus, setConnStatus] = useState<ConnStatus>("connecting");
  const [presentUsers, setPresentUsers] = useState<PresentUser[]>([]);
  // Read-only (instructor/observer) views default to showing authorship, since reviewing who
  // wrote what is the point of viewing read-only; the editable (member) view defaults off so
  // it doesn't distract from active writing.
  const [showAuthorship, setShowAuthorship] = useState(!editable);
  const [authorshipUsers, setAuthorshipUsers] = useState<AuthorshipUser[]>([]);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

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
          ]
        : [StarterKit],
      editable,
      editorProps: {
        attributes: {
          class: "ft-doc-content px-8 py-6 text-base leading-relaxed text-slate-700 min-h-[20rem]",
        },
      },
    },
    [collab]
  );

  // Keep TipTap's editable state in sync — it isn't reactive to the initial option alone.
  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

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

  if (!editor) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <Toolbar
        editor={editor}
        editable={editable}
        connStatus={connStatus}
        presentUsers={presentUsers}
        showAuthorship={showAuthorship}
        onToggleAuthorship={() => setShowAuthorship((v) => !v)}
        onImportClick={handleImportClick}
        importing={importing}
      />
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
      <EditorContent editor={editor} />
    </div>
  );
}
