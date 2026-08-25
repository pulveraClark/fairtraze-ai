import { useEffect, useRef, useState } from "react";
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
import Image from "@tiptap/extension-image";
import FontFamily from "@tiptap/extension-font-family";
import CharacterCount from "@tiptap/extension-character-count";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { useAuth } from "../context/AuthContext";
import { getUserColor } from "../lib/collabColors";
import { wsBaseUrl } from "../lib/apiBase";
import { CollaborationCursor } from "../lib/collaborationCursor";
import { FontSize } from "../lib/fontSize";
import { LineHeight } from "../lib/lineHeight";
import { AuthorshipHighlight, authorshipPluginKey } from "../lib/authorshipHighlight";
import type { AuthorshipUpdate, AuthorshipUser } from "../lib/authorshipHighlight";
import { CommentHighlight, commentHighlightPluginKey } from "../lib/commentHighlight";
import type { CommentDecorationRange } from "../lib/commentHighlight";
import { encodeCommentAnchor, decodeCommentAnchor } from "../lib/commentAnchor";
import { insertImageFile } from "../lib/imageInsert";
import { CommentPanel } from "./CommentPanel";
import type { CommentRecord } from "./CommentPanel";
import { TocPanel } from "./TocPanel";
import type { TocHeading } from "./TocPanel";
import { Toolbar, AuthorshipLegend } from "./DocumentEditorToolbar";
import type { ConnStatus, PresentUser } from "./DocumentEditorToolbar";

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

interface CollabHandle {
  groupId: number;
  ydoc: Y.Doc;
  provider: WebsocketProvider;
}

function wsUrl(path: string): string {
  return `${wsBaseUrl()}${path}`;
}

// Pure client-side derivation from current editor state — no new data model. Recomputed on
// every doc update (see onUpdate below) so the table of contents stays live as the shared
// document is edited, including by other members.
function computeHeadings(editor: Editor): TocHeading[] {
  const headings: TocHeading[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading" && (node.attrs.level === 1 || node.attrs.level === 2)) {
      headings.push({ pos, level: node.attrs.level, text: node.textContent });
    }
  });
  return headings;
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

export function DocumentEditor({ groupId, editable, awaitInitialNodeCount }: Props) {
  const { token, user } = useAuth();
  const collabRef = useRef<CollabHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
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
  const [showToc, setShowToc] = useState(false);
  const [tocHeadings, setTocHeadings] = useState<TocHeading[]>([]);
  // Purely a container/CSS toggle — same `editor` instance, same Yjs doc, no collab/data-model
  // interaction. See the render below: the toolbar + EditorContent tree is only ever mounted in
  // ONE place at a time (inline, or inside the full-viewport portal) — TipTap's EditorContent
  // binds one DOM node per editor instance, so mounting it twice at once would be a real bug, not
  // just a cosmetic one.
  const [focusMode, setFocusMode] = useState(false);
  // Cosmetic only — a min-height silhouette on the full-screen "paper" container (see the
  // focusMode render branch below). Width is identical for both sizes (8.5in = 816px); Long
  // (Philippine long bond, 8.5x13in — distinct from US Legal's 8.5x14in) is taller than Short
  // (8.5x11in). No pagination exists, so content can still overflow past this height. Local UI
  // preference only, not persisted.
  const [pageSize, setPageSize] = useState<"short" | "long">("short");
  // Full-screen only, same as pageSize — a CSS transform: scale() on the paper container.
  // Transforms don't affect layout box size, only paint, so the container's reserved space in
  // its scrolling ancestor stays at 100% regardless of zoom; verified in the browser that this
  // doesn't clip content or break click/selection/cursor positioning before treating this as done
  // (a real risk with CSS transforms on contentEditable content, not just a hypothetical one).
  const [zoom, setZoom] = useState(1);
  // Advisory, visual-only page-break overlay (full-screen only) — see the ResizeObserver effect
  // below. Purely a DOM-height measurement; never reads or writes editor/Yjs state, so it cannot
  // race with local or remote edits the way a synced page-break model would.
  const paperRef = useRef<HTMLDivElement>(null);
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);
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
            Image.configure({ allowBase64: true }),
            FontFamily,
            FontSize,
            LineHeight,
            Superscript,
            Subscript,
            CharacterCount,
          ]
        : [StarterKit],
      editable: effectiveEditable,
      editorProps: {
        attributes: {
          class: "ft-doc-content px-8 py-6 text-base leading-relaxed text-slate-700 min-h-[20rem]",
        },
        // Reuses the exact same size-cap/content-sniff validation and setImage() write path as
        // the toolbar's file-picker insert (see insertImageFile in lib/imageInsert.ts) — this is
        // just a second entry point into that one function, not a parallel implementation.
        // References the `editor` var assigned below via closure: not invoked until a real paste
        // event fires, well after useEditor has returned and assigned it.
        handlePaste: (_view, event) => {
          const files = Array.from(event.clipboardData?.files ?? []);
          const imageFile = files.find((f) => f.type.startsWith("image/"));
          if (!imageFile || !editor) return false;
          void insertImageFile(imageFile, editor, (text) => setImportMessage({ kind: "error", text }));
          return true;
        },
      },
      onSelectionUpdate: ({ editor: e }) => {
        setHasSelection(!e.state.selection.empty);
      },
      onUpdate: ({ editor: e }) => {
        setTocHeadings(computeHeadings(e));
      },
    },
    [collab]
  );

  // Keep TipTap's editable state in sync — it isn't reactive to the initial option alone.
  useEffect(() => {
    editor?.setEditable(effectiveEditable);
  }, [editor, effectiveEditable]);

  // Seed the table of contents once the editor (and its initial/synced content) is available —
  // onUpdate above only fires on subsequent changes, not for content already present at mount.
  useEffect(() => {
    if (editor) setTocHeadings(computeHeadings(editor));
  }, [editor]);

  // Advisory page-break overlay (full-screen only). ResizeObserver watches the paper container's
  // actual rendered height directly — it fires on ANY cause of a height change (local typing, a
  // remote Yjs update landing, an image finishing load), so this needs no coupling at all to
  // editor.on("update") or the Yjs doc, and therefore can't race with local/remote edits the way
  // a synced page-break model would. Debounced (not per-keystroke) — see the debounce-timer-leak
  // bug fixed earlier this session; this is deliberately not treated as a solved problem here.
  useEffect(() => {
    if (!focusMode || !paperRef.current) {
      setPageBreaks([]);
      return;
    }
    const el = paperRef.current;
    const perPage = pageSize === "long" ? 1248 : 1056;
    let pending: ReturnType<typeof setTimeout> | null = null;

    const recompute = () => {
      const breaks: number[] = [];
      for (let y = perPage; y < el.scrollHeight; y += perPage) breaks.push(y);
      setPageBreaks(breaks);
    };

    // ResizeObserver alone won't fire when only `pageSize` changes while content already exceeds
    // both page heights (no actual resize occurs) — so also recompute immediately on mount/dep
    // change, not just on observed resize events.
    recompute();

    const observer = new ResizeObserver(() => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(recompute, 400);
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      if (pending) clearTimeout(pending);
    };
  }, [focusMode, pageSize]);

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

  // Resolved at click-time, not when the TOC list was built — the doc is live and collaborative,
  // so a cached position can go stale between render and click. nodeDOM(pos) re-resolves against
  // the editor's current state.
  const handleSelectHeading = (pos: number) => {
    const dom = editor?.view.nodeDOM(pos);
    if (dom instanceof HTMLElement) {
      dom.scrollIntoView({ behavior: "smooth", block: "start" });
    }
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

  const handleInsertImageClick = () => {
    imageInputRef.current?.click();
  };

  // No REST route: the base64 data URL is inserted straight into the live collaborative
  // document via editor.chain().setImage(), the same way any other live typed content is
  // written. Size and type are only ever checked here, client-side — see insertImageFile.
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file (or re-trying after an error)
    if (!file || !editor) return;
    await insertImageFile(file, editor, (text) => setImportMessage({ kind: "error", text }));
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

  const toolbar = (
    <Toolbar
      editor={editor}
      editable={effectiveEditable}
      connStatus={connStatus}
      presentUsers={presentUsers}
      showAuthorship={showAuthorship}
      onToggleAuthorship={() => setShowAuthorship((v) => !v)}
      onImportClick={handleImportClick}
      importing={importing}
      onInsertImageClick={handleInsertImageClick}
      onExportDocx={handleExportDocx}
      exporting={exporting}
      onExportPdf={handleExportPdf}
      showComments={showComments}
      onToggleComments={() => setShowComments((v) => !v)}
      onAddComment={handleAddCommentClick}
      showToc={showToc}
      onToggleToc={() => setShowToc((v) => !v)}
      hasSelection={hasSelection}
      focusMode={focusMode}
      onToggleFocusMode={() => setFocusMode((v) => !v)}
      pageSize={pageSize}
      onChangePageSize={setPageSize}
      zoom={zoom}
      onChangeZoom={setZoom}
    />
  );

  // Inputs, banners, EditorContent, comment panel — everything except the toolbar (rendered
  // separately above so focus mode can pin it above the scrolling "paper" instead of inside it).
  // This tree must only ever be mounted in ONE of the two branches below, never both, since
  // EditorContent binds the same `editor` instance to one DOM node.
  const editorContentArea = (
    <>
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
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleImageFileChange}
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
        {showToc && <TocPanel headings={tocHeadings} onSelect={handleSelectHeading} />}
      </div>
    </>
  );

  const printPortal = createPortal(
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
  );

  if (focusMode) {
    return (
      <>
        {createPortal(
          // Light "paper" backdrop (not the dark bg-black/40 modal-scrim convention used by
          // ScoringSettingsModal.tsx/GroupManageModal.tsx — this isn't a dialog, it's an
          // immersive canvas) with the toolbar's own bg-slate-50 pinned at the top and the page
          // scrolling beneath it.
          <div className="fixed inset-0 z-50 bg-slate-300 overflow-y-auto flex flex-col">
            <div className="bg-white border-b border-slate-200 shadow-sm shrink-0">{toolbar}</div>
            <div className="flex-1 flex justify-center px-4 py-10">
              <div
                ref={paperRef}
                className="relative w-full max-w-[816px] h-fit bg-white shadow-xl rounded-sm"
                style={{
                  minHeight: pageSize === "long" ? 1248 : 1056,
                  transform: zoom !== 1 ? `scale(${zoom})` : undefined,
                  transformOrigin: "top center",
                }}
              >
                <div className="px-8 py-10">{editorContentArea}</div>
                {/* Advisory only — approximate, debounced, never touches the Y.Doc/schema. Not a
                    WYSIWYG guarantee; print/export pagination (index.css's @page rule) is a
                    separate, already-existing mechanism and stays fully decoupled from this. */}
                {pageBreaks.map((y, i) => (
                  <div
                    key={y}
                    className="absolute inset-x-0 pointer-events-none border-t border-dashed border-slate-300"
                    style={{ top: y }}
                  >
                    <span className="absolute right-2 top-1 text-[10px] text-slate-400 bg-white px-1">
                      Page {i + 2}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
        {printPortal}
      </>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {toolbar}
      {editorContentArea}
      {printPortal}
    </div>
  );
}
