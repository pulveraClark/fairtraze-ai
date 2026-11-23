import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { BriefAttachment } from "../lib/briefAttachments";
import { BriefModal } from "./BriefCard";

interface Loaded {
  title: string;
  description: string | null;
  attachments: BriefAttachment[];
}

/**
 * The project instructions over the report, for the instructor. The text and attachments are read from the
 * existing assignment endpoint only when the window opens (nothing is fetched while it is closed), and the
 * sentence a requirement comes from is marked and scrolled into view.
 */
export function InstructorInstructionsModal({ assignmentId, quote, editHref, onClose }: {
  assignmentId: number;
  quote?: string;
  editHref?: string;
  onClose: () => void;
}) {
  const { token } = useAuth();
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [data, setData] = useState<Loaded | null>(null);

  const load = useCallback(() => {
    if (!token) return () => undefined;
    let cancelled = false;
    setStatus("loading");
    fetch(`/api/assignments/${assignmentId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error("load failed");
        const json = (await res.json()) as { assignment: { title: string; description: string | null; attachments?: BriefAttachment[] } };
        if (cancelled) return;
        setData({ title: json.assignment.title, description: json.assignment.description, attachments: json.assignment.attachments ?? [] });
        setStatus("ready");
      })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [assignmentId, token]);

  useEffect(() => load(), [load]);

  return (
    <BriefModal
      assignmentId={assignmentId}
      title={data?.title ?? "Project instructions"}
      description={data?.description ?? null}
      attachments={data?.attachments ?? []}
      highlight={quote ?? null}
      status={status}
      onRetry={() => { load(); }}
      editHref={editHref}
      onClose={onClose}
    />
  );
}
