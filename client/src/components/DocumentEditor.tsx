import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import FontFamily from "@tiptap/extension-font-family";
import CharacterCount from "@tiptap/extension-character-count";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { useAuth } from "../context/AuthContext";
import { getUserColor, buildMemberRoster } from "../lib/collabColors";
import { wsBaseUrl } from "../lib/apiBase";
import { CollaborationCursor } from "../lib/collaborationCursor";
import { FontSize } from "../lib/fontSize";
import { LineHeight } from "../lib/lineHeight";
import { AuthorshipHighlight, authorshipPluginKey } from "../lib/authorshipHighlight";
import type { AuthorshipUpdate, AuthorshipUser, AuthorshipDecorationInput } from "../lib/authorshipHighlight";
import { CommentHighlight, commentHighlightPluginKey } from "../lib/commentHighlight";
import type { CommentDecorationRange } from "../lib/commentHighlight";
import { encodeCommentAnchor, decodeCommentAnchor } from "../lib/commentAnchor";
import { insertImageFile } from "../lib/imageInsert";
import { starterKitOptions, formattingExtensions, EditorShortcuts } from "../lib/formattingExtensions";
import type { EditorShortcutHandlers } from "../lib/formattingExtensions";
import { SearchReplace } from "../lib/searchReplace";
import { useCollabVersionGuard } from "../lib/useCollabVersionGuard";
import { useCollabSync } from "../lib/useCollabSync";
import { COLLAB_SCHEMA_VERSION } from "@shared/collabVersion";
import { PAGE_SIZES, MARGIN_PRESET_LABELS, resolvePageGeometry } from "@shared/pageSizes";
import { DEFAULT_PAGE_SETUP, applyPageSetup, mergePageSetup, pageSetupPatchBody, parsePageSetup, samePageSetup } from "../lib/pageSetup";
import type { PageSetup, PageSetupChange } from "../lib/pageSetup";
import { PageBreak } from "../lib/pageBreak";
import { PageSetupDialog } from "./PageSetupDialog";
import { PdfProgressPanel } from "./PdfProgressPanel";
import { HeaderFooterDialog } from "./HeaderFooterDialog";
import { paginationExtension, SCREEN_PAGE_GAP_PX } from "../lib/pageLayout";
import { printDocument } from "../lib/printDocument";
import { CommentPanel } from "./CommentPanel";
import type { CommentRecord } from "./CommentPanel";
import { TocPanel } from "./TocPanel";
import { FindReplaceBar } from "./FindReplaceBar";
import { LinkDialog } from "./LinkDialog";
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
  /** The document's title (the group's name): the PDF's file name and title metadata. */
  title?: string;
  /**
   * Heading text a task is linked to: once the document has synced, scroll to that heading. Client-only
   * navigation (reads the editor's state, writes nothing). Reports whether it was found.
   */
  scrollToHeading?: string | null;
  onHeadingResolved?: (found: boolean) => void;
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

// The gray "desk" the paper sits on. The paper is a fixed-width sheet (the real paper width in CSS
// px); on narrow screens it scales down to fit instead of scrolling sideways. Scaling is a CSS
// transform on the paper plus an outer box sized to the scaled footprint — verified (spike) that
// click/caret placement, drag selection and typing stay exact under transform at scale < 1.
// `zoom` is the user's optional zoom on top of the fit-to-width scale.
function PaperStage({ pageWidth, zoom, children }: { pageWidth: number; zoom: number; children: React.ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(pageWidth);
  const [paperHeight, setPaperHeight] = useState(0);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const paper = paperRef.current;
    if (!stage || !paper) return;
    const measure = () => {
      const cs = getComputedStyle(stage);
      setAvail(stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
      setPaperHeight(paper.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    ro.observe(paper);
    return () => ro.disconnect();
  }, []);

  const scale = Math.min(1, avail / pageWidth) * zoom;
  return (
    <div ref={stageRef} className="ft-paper-stage bg-slate-300 px-3 sm:px-6 py-6 overflow-x-auto">
      <div style={{ width: pageWidth * scale, height: paperHeight * scale, margin: "0 auto" }}>
        <div
          ref={paperRef}
          className="ft-paper"
          style={{
            width: pageWidth,
            transform: scale !== 1 ? `scale(${scale})` : undefined,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function DocumentEditor({ groupId, editable, awaitInitialNodeCount, title, scrollToHeading, onHeadingResolved }: Props) {
  const { token, user } = useAuth();
  const collabRef = useRef<CollabHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [connStatus, setConnStatus] = useState<ConnStatus>("connecting");
  const [presentUsers, setPresentUsers] = useState<PresentUser[]>([]);
  const [awaitingInitialContent, setAwaitingInitialContent] = useState(awaitInitialNodeCount !== undefined);
  // Authorship highlighting defaults on in both the instructor read-only view and the student
  // editable view, so "who wrote what" is visible without needing to discover the toggle first.
  const [showAuthorship, setShowAuthorship] = useState(true);
  const [authorshipUsers, setAuthorshipUsers] = useState<AuthorshipUser[]>([]);
  // From the initial authorship fetch only (the live push socket doesn't carry it).
  const [authorshipApproximate, setAuthorshipApproximate] = useState(false);
  const [authorshipFixedAt, setAuthorshipFixedAt] = useState<string | null>(null);
  // The group's full, stable member roster (sorted userIds) — used to color-index spans/cursors
  // collision-free within the group, instead of by raw global User.id (see collabColors.ts).
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ kind: "success" | "error"; text: string; action?: { label: string; run: () => void } } | null>(null);
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
  // Page setup (paper size, orientation, margins, header/footer text) of the page view and PDF.
  // Shared by every collaborator — plain Document columns, NOT in the Yjs doc, so it can never touch
  // authorship capture — and polled, see the effects below.
  const [pageSetup, setPageSetup] = useState<PageSetup>(DEFAULT_PAGE_SETUP);
  const pageSetupRef = useRef<PageSetup>(DEFAULT_PAGE_SETUP);
  pageSetupRef.current = pageSetup;
  const pageSetupSavingRef = useRef(false);
  const [pageSetupOpen, setPageSetupOpen] = useState(false);
  const [headerFooterOpen, setHeaderFooterOpen] = useState(false);
  const pageSize = pageSetup.pageSize;
  // Download PDF / Print: build state for the progress panel (null when idle) and the abort handle.
  const [pdfRun, setPdfRun] = useState<{ fraction: number; label: string; purpose: "download" | "print" } | null>(null);
  const pdfAbortRef = useRef<AbortController | null>(null);
  // Optional zoom on top of fit-to-width (0.75 / 1 / 1.25), a CSS transform scale on the paper.
  const [zoom, setZoom] = useState(1);
  const [pendingSelection, setPendingSelection] = useState<{ from: number; to: number } | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  // Drag handle only appears over image nodes (v1 scope — see CLAUDE.md's reposition-within-flow
  // note); the underlying move is a real ProseMirror delete+insert in one atomic transaction, same
  // as manual cut/paste already permits, just with a discoverable handle affordance.
  const [dragHandleOnImage, setDragHandleOnImage] = useState(false);
  // Extension options are captured at construction time by TipTap and don't hot-update, so the
  // click handler goes through a ref instead — kept current every render, called from inside the
  // (effectively static) CommentHighlight extension instance.
  // Find/replace bar and link dialog (editor tools). Opened from the toolbar, the Edit menu or the
  // Ctrl+F / Ctrl+H / Ctrl+K shortcuts; they never write anything except ordinary editor commands.
  const [findBar, setFindBar] = useState<{ open: boolean; replace: boolean }>({ open: false, replace: false });
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const shortcutHandlersRef = useRef<EditorShortcutHandlers>({ onLink: () => {}, onFind: () => {}, onReplace: () => {} });
  shortcutHandlersRef.current = {
    onLink: () => setLinkDialogOpen(true),
    onFind: () => setFindBar((b) => ({ open: true, replace: b.replace })),
    onReplace: () => setFindBar({ open: true, replace: true }),
  };
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
      // `v` = document schema version. The server refuses a mismatched client (an old tab would
      // delete content it does not understand and sync that deletion) - see collabVersion.ts.
      params: { token, v: String(COLLAB_SCHEMA_VERSION) },
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

  // Fetch the group's full member roster once per group — the stable, collision-free basis for
  // getUserColor (see collabColors.ts). Sorted ascending by userId for a canonical order that
  // doesn't depend on fetch-time join-order.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`/api/groups/${groupId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? (res.json() as Promise<{ members: { userId: number }[] }>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        setMemberIds(buildMemberRoster(data.members));
      })
      .catch((err) => console.error("[document] group roster fetch failed", err));
    return () => {
      cancelled = true;
    };
  }, [groupId, token]);

  useEffect(() => {
    if (!collab || !user) return;

    const { provider } = collab;
    const awareness = provider.awareness;
    awareness.setLocalStateField("user", { name: user.name, color: getUserColor(user.id, memberIds) });

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
    // This effect re-runs when the roster or the user arrives, usually AFTER the socket connected and
    // its "status" event already fired; start from the provider's real state, not always "connecting".
    setConnStatus(provider.wsconnected ? "connected" : "connecting");

    return () => {
      awareness.off("change", updatePresence);
      provider.off("status", handleStatus);
    };
  }, [collab, user, memberIds]);

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

  // Out-of-date client: stop sending updates and go read-only until the user reloads.
  const { mismatch: versionMismatch } = useCollabVersionGuard(collab?.provider ?? null);
  // The first sync must finish before anyone can type (text typed earlier could land ahead of
  // content still arriving). `editable &&` first: this can only ever switch editing OFF, so a
  // read-only viewer (the instructor) stays read-only whatever the sync state.
  const { synced, stalled: syncStalled, retry: retrySync } = useCollabSync(collab?.provider ?? null);
  const effectiveEditable = editable && synced && !awaitingInitialContent && !versionMismatch;

  const editor = useEditor(
    {
      extensions: collab
        ? [
            StarterKit.configure(starterKitOptions),
            ...formattingExtensions,
            SearchReplace,
            EditorShortcuts.configure({ handlers: () => shortcutHandlersRef.current }),
            Collaboration.configure({ document: collab.ydoc }),
            CollaborationCursor.configure({
              provider: collab.provider,
              user: { name: user?.name ?? "Unknown", color: getUserColor(user?.id ?? 0, memberIds) },
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
            Image.configure({
              allowBase64: true,
              resize: { enabled: true, directions: ["bottom-right"], alwaysPreserveAspectRatio: true },
            }),
            FontFamily,
            FontSize,
            LineHeight,
            Superscript,
            Subscript,
            CharacterCount,
            // Page view: sheets, margins, gaps are ProseMirror decoration widgets only — never
            // document content, so layout adds 0 characters to anyone's authorship count.
            // Page break: a leaf block sized from the sheet bands (lib/pageBreak.ts). Heights are
            // layout only; the empty transaction below makes the pagination plugin re-count sheets.
            PageBreak.configure({ onLayoutChanged: (view) => view.dispatch(view.state.tr) }),
            paginationExtension(pageSetupRef.current.pageSize, SCREEN_PAGE_GAP_PX, pageSetupRef.current.orientation, pageSetupRef.current.marginPreset, pageSetupRef.current.margins),
          ]
        : [StarterKit],
      editable: effectiveEditable,
      // TipTap v3's useEditor no longer force-rerenders on every transaction by default (that was
      // v2's behavior) — without this, every `editor.isActive(...)` read throughout Toolbar (Bold,
      // Italic, headings, alignment, table, ...) is a stale snapshot that only happens to update
      // when some unrelated state setter (onSelectionUpdate/onUpdate below) coincidentally fires.
      // A plain click that moves the cursor between two collapsed-selection positions (e.g. out of
      // a table, or between differently-formatted text) doesn't trigger either of those, so the
      // toolbar's active/enabled indicators silently go stale until something else forces a
      // re-render. This opts back into TipTap's own per-transaction re-render.
      shouldRerenderOnTransaction: true,
      editorProps: {
        attributes: {
          class: collab ? "ft-doc-content text-slate-700" : "ft-doc-content px-8 py-6 text-slate-700 min-h-[20rem]",
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

  // TipTap v3 throws on editor.view until EditorContent has mounted it — track that explicitly.
  const [viewReady, setViewReady] = useState(false);
  useEffect(() => {
    setViewReady(false);
    if (!editor) return;
    if (editor.isInitialized) {
      setViewReady(true);
      return;
    }
    const onCreate = () => setViewReady(true);
    editor.on("create", onCreate);
    return () => {
      editor.off("create", onCreate);
    };
  }, [editor]);

  // Apply the shared page setup to the live editor (layout only — no document transaction).
  useEffect(() => {
    if (!editor || !collab || !viewReady) return;
    applyPageSetup(editor, pageSetup);
  }, [editor, collab, viewReady, pageSetup]);

  // The pagination plugin sizes its page widgets from the DOM as it was before each transaction,
  // so a freshly synced/loaded document (or an image finishing load) can leave it one step behind.
  // Re-run it with an EMPTY transaction whenever the editor's rendered height changes — no steps,
  // so nothing reaches Yjs; it converges as soon as the page count stops changing.
  useEffect(() => {
    if (!editor || !collab || !viewReady) return;
    const dom = editor.view.dom;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const nudge = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr);
      }, 120);
    };
    nudge();
    const ro = new ResizeObserver(nudge);
    ro.observe(dom);
    return () => {
      ro.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [editor, collab, viewReady]);

  // Pick up the shared page setup, and changes other collaborators make: once on mount, on window
  // focus, and on a light 15s poll (the collab sockets are deliberately not used for this).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const pull = async () => {
      if (pageSetupSavingRef.current) return;
      try {
        const res = await fetch(`/api/groups/${groupId}/document/page-setup`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const next = parsePageSetup(await res.json());
        if (!cancelled && !pageSetupSavingRef.current && next && !samePageSetup(next, pageSetupRef.current)) setPageSetup(next);
      } catch {
        /* transient — keep the current setup */
      }
    };
    void pull();
    const timer = setInterval(pull, 15000);
    window.addEventListener("focus", pull);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", pull);
    };
  }, [groupId, token]);

  // Optimistic update with rollback. `change` is any subset of the setup (the server merges it).
  const handleChangePageSetup = useCallback(
    async (change: PageSetupChange) => {
      if (!token) return;
      const previous = pageSetupRef.current;
      setPageSetup(mergePageSetup(previous, change));
      pageSetupSavingRef.current = true;
      try {
        const res = await fetch(`/api/groups/${groupId}/document/page-setup`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(pageSetupPatchBody(change)),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          setPageSetup(previous);
          setImportMessage({ kind: "error", text: data?.error ?? "Could not change the page setup." });
        } else {
          const saved = parsePageSetup(await res.json().catch(() => null));
          if (saved) setPageSetup(saved);
        }
      } catch {
        setPageSetup(previous);
        setImportMessage({ kind: "error", text: "Could not change the page setup — check your connection and try again." });
      } finally {
        pageSetupSavingRef.current = false;
      }
    },
    [groupId, token]
  );

  // Seed the table of contents once the editor (and its initial/synced content) is available —
  // onUpdate above only fires on subsequent changes, not for content already present at mount.
  useEffect(() => {
    if (editor) setTocHeadings(computeHeadings(editor));
  }, [editor]);

  // Kept in sync with memberIds state (assigned during render, not in an effect, so it's always
  // current) so the authorship-apply effect below can read the latest roster without needing
  // memberIds in its own dependency array — see that effect's comment for why.
  const memberIdsRef = useRef<number[]>(memberIds);
  memberIdsRef.current = memberIds;
  // Last raw update applied to the plugin (from either the initial fetch or a WS push) — kept so
  // the memberIds-driven re-dispatch effect further below can recolor already-painted decorations
  // once the roster fetch resolves, without needing to refetch the authorship map itself.
  const lastAuthorshipUpdateRef = useRef<AuthorshipUpdate | null>(null);

  // While the toggle is on: fetch the current authorship map once (immediate snapshot), then
  // open a dedicated push socket (separate from the Yjs sync socket — see
  // authorshipBroadcast.ts) for live updates as teammates edit.
  useEffect(() => {
    if (!editor || !token) return;

    if (!showAuthorship) {
      lastAuthorshipUpdateRef.current = null;
      editor.view.dispatch(editor.state.tr.setMeta(authorshipPluginKey, null));
      setAuthorshipUsers([]);
      return;
    }

    let cancelled = false;
    const applyUpdate = (update: AuthorshipUpdate) => {
      if (cancelled) return;
      lastAuthorshipUpdateRef.current = update;
      setAuthorshipUsers(update.users);
      const decorationInput: AuthorshipDecorationInput = { ...update, memberIds: memberIdsRef.current };
      editor.view.dispatch(editor.state.tr.setMeta(authorshipPluginKey, decorationInput));
    };

    fetch(`/api/groups/${groupId}/document/authorship`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? (res.json() as Promise<AuthorshipUpdate & { docsDataApproximate?: boolean; docsDataFixedAt?: string }>) : null))
      .then((data) => {
        if (!data) return;
        if (!cancelled) {
          setAuthorshipApproximate(!!data.docsDataApproximate);
          setAuthorshipFixedAt(data.docsDataFixedAt ?? null);
        }
        applyUpdate(data);
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
    // memberIds is deliberately excluded here — re-run only when the roster changes, via the
    // effect below, so a resolving roster fetch doesn't close and reopen the push WebSocket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, showAuthorship, groupId, token]);

  // Recolors already-painted decorations once the group roster resolves (or changes), without
  // refetching the authorship map or reconnecting the push WebSocket above.
  useEffect(() => {
    if (!editor || !showAuthorship || !lastAuthorshipUpdateRef.current) return;
    const decorationInput: AuthorshipDecorationInput = { ...lastAuthorshipUpdateRef.current, memberIds };
    editor.view.dispatch(editor.state.tr.setMeta(authorshipPluginKey, decorationInput));
  }, [editor, showAuthorship, memberIds]);

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

  // Task "linked heading": scroll to it once the shared document has arrived. A heading that is not
  // there after the connection settles was renamed or removed, which the page explains to the user.
  const headingHandledRef = useRef<string | null>(null);
  const onHeadingResolvedRef = useRef(onHeadingResolved);
  onHeadingResolvedRef.current = onHeadingResolved;
  useEffect(() => {
    const wanted = scrollToHeading?.trim();
    if (!wanted || !editor || headingHandledRef.current === wanted) return;
    const hit = tocHeadings.find((h) => h.text.trim() === wanted);
    if (hit) {
      headingHandledRef.current = wanted;
      handleSelectHeading(hit.pos);
      onHeadingResolvedRef.current?.(true);
      return;
    }
    if (connStatus !== "connected") return;
    const timer = window.setTimeout(() => {
      headingHandledRef.current = wanted;
      onHeadingResolvedRef.current?.(false);
    }, 2500);
    return () => window.clearTimeout(timer);
    // handleSelectHeading only reads the editor, which is already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToHeading, editor, tocHeadings, connStatus]);

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

  // PDF: a separate read-only TipTap copy is laid out offscreen exactly like the page view, the
  // browser's own line positions are read, and a Web Worker writes a vector PDF from them (see
  // lib/pdf/). One click, no print dialog. Read-only: nothing here writes to the live editor, Yjs
  // or the server. pdf-lib is only loaded (dynamic import) when this runs.
  const buildDocumentPdf = async (purpose: "download" | "print") => {
    const ps = pageSetupRef.current;
    const ac = new AbortController();
    pdfAbortRef.current = ac;
    setPdfRun({ fraction: 0, label: "Starting…", purpose });
    const { buildPdf } = await import("../lib/pdf/pdfExport");
    return buildPdf({
      json: editor!.getJSON(),
      size: ps.pageSize,
      layout: { orientation: ps.orientation, margins: ps.marginPreset, customMargins: ps.margins, header: ps.header, footer: ps.footer },
      title: title?.trim() || "Document",
      signal: ac.signal,
      onProgress: (p) => setPdfRun({ fraction: p.fraction, label: p.label, purpose }),
    });
  };
  const missingNote = (missing: string[]) =>
    missing.length ? ` Some characters (${missing.slice(0, 8).join(" ")}${missing.length > 8 ? " …" : ""}) are not in the document fonts and were left out.` : "";

  // Browser print window of the old print copy: only the fallback when the PDF path cannot be used.
  const printWithBrowser = async () => {
    const ps = pageSetupRef.current;
    try {
      await printDocument(editor!.getJSON(), ps.pageSize, {
        orientation: ps.orientation, margins: ps.marginPreset, customMargins: ps.margins, header: ps.header, footer: ps.footer,
      });
    } catch (err) {
      console.error("[print] failed", err);
      setImportMessage({ kind: "error", text: "Printing failed — try again." });
    }
  };

  const handleDownloadPdf = async () => {
    if (!editor || pdfRun) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    setImportMessage(null);
    try {
      const result = await buildDocumentPdf("download");
      const { downloadBlob } = await import("../lib/pdf/pdfExport");
      const { pdfFileName } = await import("../lib/pdf/pdfFileName");
      const name = pdfFileName(title);
      downloadBlob(result.blob, name);
      setImportMessage({ kind: "success", text: `PDF downloaded: ${name} (${result.pages} ${result.pages === 1 ? "page" : "pages"}).${missingNote(result.missing)}` });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setImportMessage({ kind: "success", text: "PDF export cancelled. Nothing was downloaded." });
      } else {
        console.error("[pdf export] failed", err);
        setImportMessage({
          kind: "error",
          text: `The PDF could not be created${err instanceof Error && err.message ? ` (${err.message})` : ""}. You can print the document instead.`,
          action: { label: "Use Print instead", run: () => void handlePrint() },
        });
      }
    } finally {
      pdfAbortRef.current = null;
      setPdfRun(null);
    }
  };

  // Print = the same PDF opened in the browser's PDF viewer (a new tab), which scales to the paper and
  // margins the user picks there. The tab is opened right away, inside the click, so a pop-up blocker
  // does not stop it; the PDF is put into it when it is ready.
  const handlePrint = async () => {
    if (!editor || pdfRun) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    setImportMessage(null);
    const tab = window.open("", "_blank");
    if (!tab) {
      // Pop-ups are blocked: use the browser's own print window instead.
      await printWithBrowser();
      return;
    }
    try {
      tab.document.title = "Preparing PDF…";
      tab.document.body.textContent = "Preparing the PDF…";
    } catch {
      /* the new tab may not be scriptable; it is only a placeholder */
    }
    try {
      const result = await buildDocumentPdf("print");
      const url = URL.createObjectURL(result.blob);
      tab.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000);
      setImportMessage({ kind: "success", text: `The PDF opened in a new tab: print it from there.${missingNote(result.missing)}` });
    } catch (err) {
      tab.close();
      if (err instanceof DOMException && err.name === "AbortError") {
        setImportMessage({ kind: "success", text: "Print cancelled." });
      } else {
        console.error("[print] pdf failed", err);
        setImportMessage({
          kind: "error",
          text: "The PDF could not be created for printing.",
          action: { label: "Use the browser's print window", run: () => void printWithBrowser() },
        });
      }
    } finally {
      pdfAbortRef.current = null;
      setPdfRun(null);
    }
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

  const pageSummary = `${PAGE_SIZES[pageSetup.pageSize].label.split(" (")[0]}, ${
    pageSetup.orientation === "LANDSCAPE" ? "landscape" : "portrait"
  }, ${MARGIN_PRESET_LABELS[pageSetup.marginPreset].split(" (")[0].toLowerCase()} margins`;

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
      onDownloadPdf={() => void handleDownloadPdf()}
      onPrint={() => void handlePrint()}
      showComments={showComments}
      onToggleComments={() => setShowComments((v) => !v)}
      onAddComment={handleAddCommentClick}
      showToc={showToc}
      onToggleToc={() => setShowToc((v) => !v)}
      hasSelection={hasSelection}
      focusMode={focusMode}
      onToggleFocusMode={() => setFocusMode((v) => !v)}
      pageSummary={pageSummary}
      onOpenPageSetup={() => setPageSetupOpen(true)}
      onOpenHeaderFooter={() => setHeaderFooterOpen(true)}
      pdfBusy={!!pdfRun}
      zoom={zoom}
      onChangeZoom={setZoom}
      onOpenFind={(replace) => setFindBar({ open: true, replace })}
      onOpenLink={() => setLinkDialogOpen(true)}
    />
  );

  // Inputs, banners, EditorContent, comment panel — everything except the toolbar (rendered
  // separately above so focus mode can pin it above the scrolling "paper" instead of inside it).
  // This tree must only ever be mounted in ONE of the two branches below, never both, since
  // EditorContent binds the same `editor` instance to one DOM node.
  const editorContentArea = (
    <>
      {versionMismatch && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 border-b border-amber-300 bg-amber-50 text-sm text-amber-900">
          <span>A new version is available - reload to keep editing.</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-9 rounded border border-amber-700 bg-amber-700 px-3 text-sm font-semibold text-white hover:bg-amber-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
          >
            Reload
          </button>
        </div>
      )}
      {!synced && !versionMismatch && (
        <div
          role="status"
          className={`flex flex-wrap items-center justify-between gap-3 px-3 py-1.5 border-b text-xs font-medium ${
            syncStalled ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-100 bg-slate-50/60 text-slate-600"
          }`}
        >
          <span>{syncStalled ? "Still connecting. Check your internet, or reload" : "Connecting to the shared document…"}</span>
          {syncStalled && (
            <button
              type="button"
              onClick={retrySync}
              className="min-h-8 rounded border border-amber-700 bg-amber-700 px-3 text-xs font-semibold text-white hover:bg-amber-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
            >
              Retry
            </button>
          )}
        </div>
      )}
      {awaitingInitialContent && synced && (
        <div className="px-3 py-1.5 border-b border-slate-100 bg-slate-50/60 text-xs text-slate-400 font-medium">
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
          role={importMessage.kind === "error" ? "alert" : "status"}
          className={`flex items-center justify-between gap-3 px-3 py-1.5 border-b text-xs ${
            importMessage.kind === "success"
              ? "bg-emerald-50 border-emerald-100 text-emerald-700"
              : "bg-red-50 border-red-100 text-red-700"
          }`}
        >
          <span>{importMessage.text}</span>
          {importMessage.action && (
            <button
              type="button"
              onClick={() => {
                const run = importMessage.action!.run;
                setImportMessage(null);
                run();
              }}
              className="shrink-0 min-h-8 rounded border border-current px-2 font-semibold hover:bg-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
            >
              {importMessage.action.label}
            </button>
          )}
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
      {pdfRun && (
        <PdfProgressPanel
          purpose={pdfRun.purpose}
          fraction={pdfRun.fraction}
          label={pdfRun.label}
          onCancel={() => pdfAbortRef.current?.abort()}
        />
      )}
      {findBar.open && (
        <FindReplaceBar
          editor={editor}
          editable={effectiveEditable}
          showReplace={findBar.replace}
          onToggleReplace={() => setFindBar((b) => ({ ...b, replace: !b.replace }))}
          onClose={() => setFindBar({ open: false, replace: false })}
        />
      )}
      {linkDialogOpen && effectiveEditable && <LinkDialog editor={editor} onClose={() => setLinkDialogOpen(false)} />}
      {pageSetupOpen && effectiveEditable && (
        <PageSetupDialog
          editor={editor}
          value={pageSetup}
          onApply={(change) => void handleChangePageSetup(change)}
          onClose={() => setPageSetupOpen(false)}
        />
      )}
      {headerFooterOpen && effectiveEditable && (
        <HeaderFooterDialog
          editor={editor}
          header={pageSetup.header}
          footer={pageSetup.footer}
          onApply={(change) => void handleChangePageSetup(change)}
          onClose={() => setHeaderFooterOpen(false)}
        />
      )}
      {showAuthorship && (
        <AuthorshipLegend
          users={authorshipUsers}
          memberIds={memberIds}
          approximate={authorshipApproximate}
          fixedAt={authorshipFixedAt}
        />
      )}
      <div className="flex flex-col md:flex-row items-stretch">
        <div
          className="flex-1 min-w-0 outline-none"
          tabIndex={effectiveEditable ? undefined : -1}
          onKeyDown={(e) => {
            if (effectiveEditable) return; // the editor's own keymap handles it while editing
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "f") {
              e.preventDefault();
              setFindBar((b) => ({ open: true, replace: b.replace }));
            }
          }}
        >
          <PaperStage pageWidth={resolvePageGeometry(pageSetup.pageSize, pageSetup.orientation, pageSetup.marginPreset, pageSetup.margins).widthPx} zoom={zoom}>
          <DragHandle
            editor={editor}
            onNodeChange={({ node }) => setDragHandleOnImage(node?.type.name === "image")}
          >
            <div
              className={`ft-drag-handle ${dragHandleOnImage ? "" : "ft-drag-handle-hidden"}`}
              aria-label="Drag to reposition image"
              title="Drag to reposition"
            >
              ⠿
            </div>
          </DragHandle>
          <EditorContent editor={editor} />
          </PaperStage>
        </div>
        {showComments && (
          <CommentPanel
            comments={comments}
            currentUserId={user?.id ?? -1}
            memberIds={memberIds}
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

  if (focusMode) {
    return createPortal(
      // Full-viewport immersive view: the toolbar stays pinned above the scrolling gray desk and
      // is never part of the page. (Light gray, not the dark modal-scrim convention — this is a
      // canvas, not a dialog.)
      <div className="ft-focus-scroll fixed inset-0 z-50 bg-slate-300 overflow-y-auto flex flex-col">
        <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm shrink-0">{toolbar}</div>
        <div className="flex-1">{editorContentArea}</div>
      </div>,
      document.body
    );
  }

  // Inline: the toolbar sticks above the paper while scrolling, never inside the sheet. (No
  // overflow-hidden on the card — it would break position: sticky.)
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
      <div className="sticky top-[var(--ft-header-h,0px)] z-30 bg-slate-50 rounded-t-xl overflow-hidden">{toolbar}</div>
      {editorContentArea}
    </div>
  );
}
