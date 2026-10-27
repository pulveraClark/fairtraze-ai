import { useEffect, useRef, useState } from "react";
import { FOCUS_LIGHT } from "./ui";
import { useFocusTrap } from "./ui/useFocusTrap";
import { isAcceptedBriefImage, prepareBriefImage } from "../lib/briefImage";
import {
  INSTRUCTOR_WAITING, LEADER_DECLINED, LEADER_WAITING, MARK_NOTE_MAX, markDate,
  type KeyMarks, type RequirementMark,
} from "../lib/requirementMarks";
import type { MarksApi } from "../hooks/useRequirementMarks";

// The "We have this" controls under one requirement the AI could not confirm. The leader claims (a one-line note
// and one screenshot), the owning instructor confirms or asks for a closer look, or marks any item "I checked:
// covered". The AI result stays visible above; a leader claim is never counted as covered until confirmed.

const BTN = `inline-flex min-h-10 items-center justify-center rounded-lg border px-3 text-sm font-medium ${FOCUS_LIGHT}`;
const BTN_PRIMARY = `${BTN} border-indigo-700 bg-indigo-700 text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-60`;
const BTN_PLAIN = `${BTN} border-slate-300 bg-white text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60`;

/** A picture that needs the sign-in token, loaded as an object URL (revoked on unmount). */
function useBlobUrl(load: (() => Promise<Blob>) | null, dep: string | null): { src: string | null; failed: boolean } {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setSrc(null);
    setFailed(false);
    if (!load) return;
    let url: string | null = null;
    let cancelled = false;
    load().then((b) => { if (!cancelled) { url = URL.createObjectURL(b); setSrc(url); } }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
    // `load` is rebuilt every render; the picture changes only with `dep`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep]);
  return { src, failed };
}

function Enlarged({ src, label, onClose }: { src: string; label: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(true, ref, onClose);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-2 sm:p-6" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} className="flex max-h-full max-w-full flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className={`${BTN} border-white/40 bg-white text-slate-900`}>Close</button>
        <img src={src} alt={label} className="max-h-[80vh] max-w-full rounded-lg bg-white object-contain" />
      </div>
    </div>
  );
}

/** Thumbnail of a mark's picture; click to enlarge. */
function Thumb({ mark, api }: { mark: RequirementMark; api: MarksApi }) {
  const { src, failed } = useBlobUrl(mark.imageUrl ? () => api.loadImage(mark.imageUrl!) : null, mark.imageUrl ? `${mark.imageUrl}#${mark.updatedAt}` : null);
  const [big, setBig] = useState(false);
  if (!mark.imageUrl) return null;
  if (failed) return <p className="text-xs text-slate-700">The picture could not be loaded.</p>;
  if (!src) return <div className="h-16 w-24 animate-pulse rounded-lg bg-slate-100" aria-hidden="true" />;
  const label = `Picture added by ${mark.markedBy.name}`;
  return (
    <>
      <button type="button" onClick={() => setBig(true)} aria-label={`${label}. Click to enlarge`} className={`inline-flex min-h-10 rounded-lg ${FOCUS_LIGHT}`}>
        <img src={src} alt={label} className="max-h-20 max-w-[8rem] rounded-lg border border-slate-300 object-cover" />
      </button>
      {big && <Enlarged src={src} label={label} onClose={() => setBig(false)} />}
    </>
  );
}

function Who({ mark }: { mark: RequirementMark }) {
  return <span className="text-xs text-slate-700">{mark.markedByYou ? "You" : mark.markedBy.name} · {markDate(mark.createdAt)}</span>;
}

function NoteAndPicture({ mark, api }: { mark: RequirementMark; api: MarksApi }) {
  return (
    <>
      {mark.note && <p className="text-sm text-slate-900 [overflow-wrap:anywhere]">“{mark.note}”</p>}
      <Thumb mark={mark} api={api} />
    </>
  );
}

/** The leader's form: one-line note, a picture by Ctrl+V or "Add a picture", then Send. */
function ClaimForm({ requirementKey, initialNote, api, onDone }: { requirementKey: string; initialNote: string; api: MarksApi; onDone: () => void }) {
  const [note, setNote] = useState(initialNote);
  const [picture, setPicture] = useState<Blob | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!picture) { setSrc(null); return; }
    const url = URL.createObjectURL(picture);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [picture]);

  async function take(file: File | null | undefined) {
    if (!file) return;
    const bad = isAcceptedBriefImage(file);
    if (bad) { setProblem(bad); return; }
    setProblem(null);
    try {
      setPicture(await prepareBriefImage(file));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Could not use this picture.");
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
    if (!file) return; // plain text pastes into the note as usual
    e.preventDefault();
    void take(file);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await api.claim(requirementKey, note, picture);
    setBusy(false);
    if (ok) onDone();
  }

  return (
    <form onSubmit={(e) => void send(e)} onPaste={onPaste} className="space-y-2">
      <label className="block text-xs font-semibold text-slate-800" htmlFor={`mark-note-${requirementKey}`}>Where is it? (optional)</label>
      <input
        id={`mark-note-${requirementKey}`}
        value={note}
        maxLength={MARK_NOTE_MAX}
        onChange={(e) => setNote(e.target.value)}
        placeholder="For example: in the User Guide, page 3"
        className={`min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder-slate-600 ${FOCUS_LIGHT}`}
      />
      <p className="text-xs text-slate-700">{note.length}/{MARK_NOTE_MAX}</p>
      <div tabIndex={0} aria-label="Press Ctrl+V to paste a picture here" className={`rounded-lg border border-dashed border-slate-400 bg-slate-50 p-2 text-xs text-slate-800 ${FOCUS_LIGHT}`}>
        {src ? (
          <div className="flex flex-wrap items-center gap-2">
            <img src={src} alt="The picture you added" className="max-h-20 max-w-[8rem] rounded-lg border border-slate-300 object-cover" />
            <button type="button" onClick={() => setPicture(null)} className={BTN_PLAIN}>Remove picture</button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Press Ctrl+V to paste a picture here, or</span>
            <button type="button" onClick={() => fileRef.current?.click()} className={BTN_PLAIN}>Add a picture</button>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {problem && <p role="alert" className="text-xs text-red-800">{problem}</p>}
      {api.error && <p role="alert" className="text-xs text-red-800">{api.error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={BTN_PRIMARY}>{busy ? "Sending…" : "Send"}</button>
        <button type="button" onClick={onDone} disabled={busy} className={BTN_PLAIN}>Cancel</button>
      </div>
    </form>
  );
}

function InstructorCheckForm({ requirementKey, api, onDone }: { requirementKey: string; api: MarksApi; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await api.confirm(requirementKey, note);
    setBusy(false);
    if (ok) onDone();
  }
  return (
    <form onSubmit={(e) => void save(e)} className="space-y-2">
      <label className="block text-xs font-semibold text-slate-800" htmlFor={`check-note-${requirementKey}`}>Note (optional)</label>
      <input id={`check-note-${requirementKey}`} value={note} maxLength={MARK_NOTE_MAX} onChange={(e) => setNote(e.target.value)} className={`min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 ${FOCUS_LIGHT}`} />
      {api.error && <p role="alert" className="text-xs text-red-800">{api.error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={BTN_PRIMARY}>{busy ? "Saving…" : "Save"}</button>
        <button type="button" onClick={onDone} disabled={busy} className={BTN_PLAIN}>Cancel</button>
      </div>
    </form>
  );
}

const Box = ({ children, label }: { children: React.ReactNode; label: string }) => (
  <div role="group" aria-label={label} className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">{children}</div>
);

/**
 * `canClaim`: this row is "Not clear yet" (the leader's item). `canCheck`: any row the AI did not mark covered
 * (the instructor's "I checked: covered").
 */
export function RequirementMarkPanel({ requirementKey, marks, api, canClaim, canCheck }: {
  requirementKey: string; marks: KeyMarks | undefined; api: MarksApi; canClaim: boolean; canCheck: boolean;
}) {
  const [form, setForm] = useState(false);
  const leaderMark = marks?.leader;
  const instructorMark = marks?.instructor;

  if (instructorMark) {
    const mine = instructorMark.markedByYou;
    return (
      <Box label="Confirmed by the instructor">
        <p className="text-sm font-semibold text-emerald-900"><span aria-hidden="true">✓ </span>Confirmed by the instructor</p>
        <Who mark={instructorMark} />
        <NoteAndPicture mark={instructorMark} api={api} />
        {(mine || api.role === "instructor") && <button type="button" onClick={() => void api.remove(instructorMark.id)} className={BTN_PLAIN}>Undo</button>}
      </Box>
    );
  }

  if (api.role === "instructor") {
    if (leaderMark) {
      const declined = leaderMark.status === "LEADER_CLAIM_DECLINED";
      return (
        <Box label="The leader says this is covered">
          <p className="text-sm font-semibold text-slate-900">{declined ? "You asked for a closer look." : INSTRUCTOR_WAITING}</p>
          <Who mark={leaderMark} />
          <NoteAndPicture mark={leaderMark} api={api} />
          {api.error && <p role="alert" className="text-xs text-red-800">{api.error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void api.confirm(requirementKey, "")} className={BTN_PRIMARY}>Confirm</button>
            {!declined && <button type="button" onClick={() => void api.decline(leaderMark.id)} className={BTN_PLAIN}>Not yet</button>}
            <button type="button" onClick={() => void api.remove(leaderMark.id)} className={BTN_PLAIN}>Remove this mark</button>
          </div>
        </Box>
      );
    }
    if (!canCheck) return null;
    return form ? (
      <Box label="I checked: covered"><InstructorCheckForm requirementKey={requirementKey} api={api} onDone={() => setForm(false)} /></Box>
    ) : (
      <div className="mt-1"><button type="button" onClick={() => setForm(true)} className={BTN_PLAIN}>I checked: covered</button></div>
    );
  }

  // The leader.
  if (leaderMark) {
    const declined = leaderMark.status === "LEADER_CLAIM_DECLINED";
    if (form) {
      return <Box label="We have this"><ClaimForm requirementKey={requirementKey} initialNote={leaderMark.note ?? ""} api={api} onDone={() => setForm(false)} /></Box>;
    }
    return (
      <Box label="You marked this as covered">
        <p className="text-sm font-semibold text-slate-900">{declined ? LEADER_DECLINED : LEADER_WAITING}</p>
        <Who mark={leaderMark} />
        <NoteAndPicture mark={leaderMark} api={api} />
        {api.error && <p role="alert" className="text-xs text-red-800">{api.error}</p>}
        <div className="flex flex-wrap gap-2">
          {declined && <button type="button" onClick={() => setForm(true)} className={BTN_PRIMARY}>Send a new note or picture</button>}
          <button type="button" onClick={() => void api.remove(leaderMark.id)} className={BTN_PLAIN}>Undo</button>
        </div>
      </Box>
    );
  }
  if (!canClaim) return null;
  return form ? (
    <Box label="We have this"><ClaimForm requirementKey={requirementKey} initialNote="" api={api} onDone={() => setForm(false)} /></Box>
  ) : (
    <div className="mt-1"><button type="button" onClick={() => setForm(true)} className={BTN_PLAIN}>We have this</button></div>
  );
}
