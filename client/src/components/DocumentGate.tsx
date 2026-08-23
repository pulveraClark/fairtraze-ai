import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { DocumentEditor } from "./DocumentEditor";
import { DOCUMENT_TEMPLATES, findDocumentTemplate } from "@shared/documentTemplates";
import type { DocumentTemplate } from "@shared/documentTemplates";

interface Props {
  groupId: number;
  editable: boolean;
  // Whether the current viewer may pick the starting template (leader/instructor only —
  // see server/src/routes/documents.ts POST /document/init). Non-choosers just wait or,
  // for the read-only instructor view, see an empty state.
  canChooseTemplate: boolean;
}

// Gates DocumentEditor behind a one-time "start your document" step: before any Document row
// exists for the group, the leader (or instructor) picks a template or starts blank. Once a
// document exists, this renders DocumentEditor exactly as before — no behavior change for
// already-started documents.
export function DocumentGate({ groupId, editable, canChooseTemplate }: Props) {
  const { token } = useAuth();
  const [exists, setExists] = useState<boolean | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set only when THIS browser session just created the document via handleChoose below — never
  // on the initial /status load. Tells DocumentEditor how many top-level nodes to wait for before
  // accepting input, so a leader typing immediately after picking a template can't land text
  // ahead of the template content while its initial Yjs sync is still in flight. Reopening an
  // already-started document never sets this, so that path is unaffected (see DocumentEditor.tsx).
  const [justCreatedNodeCount, setJustCreatedNodeCount] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`/api/groups/${groupId}/document/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? (res.json() as Promise<{ exists: boolean }>) : null))
      .then((data) => {
        if (!cancelled) setExists(data?.exists ?? false);
      })
      .catch(() => {
        if (!cancelled) setExists(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, token]);

  const handleChoose = async (templateId?: string) => {
    if (!token || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/document/init`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(templateId ? { templateId } : {}),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Could not start the document.");
        return;
      }
      setJustCreatedNodeCount(templateId ? (findDocumentTemplate(templateId)?.content.content.length ?? 0) : 0);
      setExists(true);
    } catch {
      setError("Could not start the document — check your connection and try again.");
    } finally {
      setCreating(false);
    }
  };

  if (exists === null) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-400">
        Loading…
      </div>
    );
  }

  if (exists) {
    return (
      <DocumentEditor
        groupId={groupId}
        editable={editable}
        awaitInitialNodeCount={justCreatedNodeCount ?? undefined}
      />
    );
  }

  if (!canChooseTemplate) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <p className="text-sm text-slate-500">
          {editable
            ? "Your group leader hasn't started the document yet."
            : "This group hasn't started their document yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <h3 className="text-sm font-semibold text-slate-700 mb-1">Start your document</h3>
      <p className="text-xs text-slate-400 mb-4">
        Choose a starting structure, or start blank. This is a one-time choice for the group.
      </p>
      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {DOCUMENT_TEMPLATES.map((t: DocumentTemplate) => (
          <button
            key={t.id}
            type="button"
            disabled={creating}
            onClick={() => handleChoose(t.id)}
            className="text-left border border-slate-200 rounded-lg p-4 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors disabled:opacity-50"
          >
            <p className="text-sm font-semibold text-slate-700">{t.name}</p>
            <p className="text-xs text-slate-400 mt-1">{t.description}</p>
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={creating}
        onClick={() => handleChoose(undefined)}
        className="mt-4 text-xs font-medium text-slate-500 hover:text-slate-700 underline disabled:opacity-50"
      >
        Start with a blank document
      </button>
    </div>
  );
}
