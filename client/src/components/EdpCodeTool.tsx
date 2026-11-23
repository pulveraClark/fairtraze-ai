import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { SEMESTERS, SEMESTER_LABEL, isValidSchoolYear, termOf, type Semester } from "@shared/schoolTerm";
import { BUTTON_PRIMARY } from "./ui";

const FIELD = "w-full min-h-10 rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400";

/**
 * Admin tool: change or release an EDP code held by the wrong class. The admin names the code and its term and
 * never sees the class or its owner.
 */
export function EdpCodeTool({ onToast }: { onToast?: (type: "success" | "error", msg: string) => void }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [edpCode, setEdpCode] = useState("");
  const [schoolYear, setSchoolYear] = useState(() => termOf(new Date()).schoolYear);
  const [semester, setSemester] = useState<Semester>(() => termOf(new Date()).semester);
  const [newEdpCode, setNewEdpCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!edpCode.trim() || !isValidSchoolYear(schoolYear.trim())) {
      onToast?.("error", "Enter the EDP code and a school year like 2026-2027.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/edp-codes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ edpCode: edpCode.trim(), schoolYear: schoolYear.trim(), semester, newEdpCode: newEdpCode.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not change the EDP code.");
      onToast?.("success", newEdpCode.trim() ? "EDP code changed." : "EDP code released.");
      setEdpCode("");
      setNewEdpCode("");
    } catch (err) {
      onToast?.("error", err instanceof Error ? err.message : "Could not change the EDP code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-slate-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-slate-600">EDP codes</p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="ft-hit rounded px-2 text-xs font-semibold text-indigo-700 hover:text-indigo-900 transition-colors"
        >
          {open ? "Cancel" : "Change a code"}
        </button>
      </div>
      <p className="text-xs text-slate-600 mb-3">Each code is used once per semester. Release or change one that is held by the wrong class.</p>
      {open && (
        <form onSubmit={(e) => void submit(e)} className="space-y-2">
          <label className="block text-xs text-slate-600" htmlFor="edp-tool-code">EDP code in use</label>
          <input id="edp-tool-code" required value={edpCode} onChange={(e) => setEdpCode(e.target.value)} className={`${FIELD} font-mono`} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-slate-600" htmlFor="edp-tool-year">School year</label>
              <input id="edp-tool-year" required value={schoolYear} onChange={(e) => setSchoolYear(e.target.value)} className={`${FIELD} tabular-nums`} />
            </div>
            <div>
              <label className="block text-xs text-slate-600" htmlFor="edp-tool-sem">Semester</label>
              <select id="edp-tool-sem" value={semester} onChange={(e) => setSemester(e.target.value as Semester)} className={FIELD}>
                {SEMESTERS.map((s) => <option key={s} value={s}>{SEMESTER_LABEL[s]}</option>)}
              </select>
            </div>
          </div>
          <label className="block text-xs text-slate-600" htmlFor="edp-tool-new">New code (leave empty to release)</label>
          <input id="edp-tool-new" value={newEdpCode} onChange={(e) => setNewEdpCode(e.target.value)} className={`${FIELD} font-mono`} />
          <button type="submit" disabled={busy || !edpCode.trim()} className={`${BUTTON_PRIMARY} w-full`}>
            {busy ? "Saving…" : newEdpCode.trim() ? "Change code" : "Release code"}
          </button>
        </form>
      )}
    </div>
  );
}
