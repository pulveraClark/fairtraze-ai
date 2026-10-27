import { useCallback, useEffect, useState } from "react";
import type { RequirementMark } from "../lib/requirementMarks";

export interface MarksApi {
  marks: RequirementMark[];
  /** The instructor confirms and declines; the leader claims. The server enforces it. */
  role: "instructor" | "leader";
  /** Plain message from the last failed action; null otherwise. */
  error: string | null;
  claim: (requirementKey: string, note: string, picture: Blob | null) => Promise<boolean>;
  confirm: (requirementKey: string, note: string) => Promise<boolean>;
  decline: (markId: number) => Promise<boolean>;
  remove: (markId: number) => Promise<boolean>;
  /** Authenticated bytes of a mark's picture, for a thumbnail. */
  loadImage: (url: string) => Promise<Blob>;
}

/**
 * Reads the marks of a group and offers the actions. Never blocks the page: a failed read leaves the list as it was,
 * a failed action sets `error` and returns false. No polling (a mark is read when the card opens and after each action).
 */
export function useRequirementMarks(projectId: number, token: string | null, role: "instructor" | "leader"): MarksApi {
  const [marks, setMarks] = useState<RequirementMark[]>([]);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/groups/${projectId}/requirement-marks`;
  const auth = { Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    try {
      const res = await fetch(base, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const body = (await res.json()) as { marks?: RequirementMark[] };
      setMarks(Array.isArray(body.marks) ? body.marks : []);
    } catch {
      // The marks are optional; the check still shows without them.
    }
  }, [base, token]);

  useEffect(() => {
    if (token) void load();
  }, [load, token]);

  async function send(url: string, init: RequestInit, fallback: string): Promise<{ ok: boolean; body: { id?: number } }> {
    setError(null);
    try {
      const res = await fetch(url, { ...init, headers: { ...auth, ...(init.headers ?? {}) } });
      const body = (await res.json().catch(() => ({}))) as { id?: number; error?: string };
      if (!res.ok) {
        setError(body.error ?? fallback);
        return { ok: false, body };
      }
      return { ok: true, body };
    } catch {
      setError("Network error. Please try again.");
      return { ok: false, body: {} };
    }
  }

  const json = (data: unknown): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  return {
    marks,
    role,
    error,
    async claim(requirementKey, note, picture) {
      const r = await send(`${base}/claim`, json({ requirementKey, note }), "Could not save this.");
      if (!r.ok) return false;
      if (picture && r.body.id) {
        const up = await send(
          `${base}/${r.body.id}/image`,
          { method: "PUT", headers: { "Content-Type": picture.type }, body: picture },
          "The picture could not be saved.",
        );
        if (!up.ok) {
          await load();
          return false;
        }
      }
      await load();
      return true;
    },
    async confirm(requirementKey, note) {
      const r = await send(`${base}/confirm`, json({ requirementKey, note }), "Could not save this.");
      await load();
      return r.ok;
    },
    async decline(markId) {
      const r = await send(`${base}/${markId}/decline`, { method: "PATCH" }, "Could not save this.");
      await load();
      return r.ok;
    },
    async remove(markId) {
      const r = await send(`${base}/${markId}`, { method: "DELETE" }, "Could not undo this.");
      await load();
      return r.ok;
    },
    async loadImage(url) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Picture unavailable");
      return res.blob();
    },
  };
}
