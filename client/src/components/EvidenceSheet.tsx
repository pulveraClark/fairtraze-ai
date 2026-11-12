import type { CSSProperties } from "react";
import { EVIDENCE_UNIVERSITY_NAME, type EvidenceReportDto } from "@shared/evidenceReport";
import { flagsText, manilaDateTime, pctText, sourcesText, tableNote } from "../lib/evidenceText";

// The one-page Contribution Evidence Report as it prints: Letter, serif, black and grey only.
// Evidence, not a grade: the Instructor Decision boxes are always empty and nothing suggests an outcome.

const INK = "#111111";
const GREY = "#555555";
const RULE = "#9a9a9a";

const labelCell: CSSProperties = { fontWeight: 700, whiteSpace: "nowrap", paddingRight: "0.18in", verticalAlign: "top" };
const th: CSSProperties = { border: `1px solid ${INK}`, padding: "3px 6px", textAlign: "left", background: "#e6e6e6", fontWeight: 700 };
const td: CSSProperties = { border: `1px solid ${RULE}`, padding: "3px 6px", verticalAlign: "top" };
const tdNum: CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };

const DECISIONS = [
  "Same grade for all members",
  "Individual grades based on the contribution evidence",
  "Needs further review",
];

function InfoRow({ label, value, boldValue = false }: { label: string; value: string; boldValue?: boolean }) {
  return (
    <tr>
      <td style={labelCell}>{label}:</td>
      <td style={{ fontWeight: boldValue ? 700 : 400, wordBreak: "break-all" }}>{value}</td>
    </tr>
  );
}

export function EvidenceSheet({ dto }: { dto: EvidenceReportDto }) {
  const showGithub = dto.sourceType !== "EDITOR";
  const showDocs = dto.sourceType !== "GITHUB";
  const repo = dto.sourceType === "EDITOR" ? "Not applicable" : dto.repoUrl || "Not linked";

  return (
    <article
      className="ft-evidence-sheet"
      aria-label="Contribution Evidence Report"
      style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif', color: INK, background: "#ffffff", fontSize: "10.5pt", lineHeight: 1.35 }}
    >
      <header style={{ textAlign: "center", borderBottom: `2px solid ${INK}`, paddingBottom: "0.1in" }}>
        <div style={{ fontSize: "12pt", fontWeight: 700, letterSpacing: "0.02em" }}>{EVIDENCE_UNIVERSITY_NAME}</div>
        <div style={{ fontSize: "10.5pt", color: GREY }}>{dto.collegeName}</div>
        <h1 style={{ fontSize: "16pt", fontWeight: 700, margin: "0.08in 0 0.02in" }}>Contribution Evidence Report</h1>
        <div style={{ fontSize: "11pt" }}>{dto.groupName}</div>
      </header>

      <table style={{ marginTop: "0.12in", borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          <InfoRow label="Class" value={dto.className} />
          <InfoRow label="Project" value={dto.projectTitle} />
          <InfoRow label="Repository" value={repo} />
          <InfoRow label="Analyzed" value={manilaDateTime(dto.analyzedAt)} />
          <InfoRow label="Generated" value={manilaDateTime(dto.generatedAt)} />
          <InfoRow label="Sources" value={sourcesText(dto.sourceType)} />
          <InfoRow label="Report ID" value={dto.reportId} boldValue />
        </tbody>
      </table>

      <p style={{ fontWeight: 700, margin: "0.14in 0 0.05in" }}>Table 1. Recorded contribution and flags per member.</p>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={th} scope="col">Member</th>
            {showGithub && <th style={{ ...th, textAlign: "right" }} scope="col">GitHub</th>}
            {showDocs && <th style={{ ...th, textAlign: "right" }} scope="col">Documents</th>}
            <th style={{ ...th, textAlign: "right" }} scope="col">Combined</th>
            <th style={th} scope="col">Flags</th>
          </tr>
        </thead>
        <tbody>
          {dto.members.map((m, i) => (
            <tr key={`${m.name}-${i}`} style={{ breakInside: "avoid" }}>
              <td style={td}>{m.name}</td>
              {showGithub && <td style={tdNum}>{m.githubPct === null ? "—" : pctText(m.githubPct)}</td>}
              {showDocs && <td style={tdNum}>{m.docsPct === null ? "—" : pctText(m.docsPct)}</td>}
              <td style={{ ...tdNum, fontWeight: 700 }}>{pctText(m.combinedPct)}</td>
              <td style={td}>{flagsText(m.flags)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: "9pt", color: GREY, margin: "0.06in 0 0" }}>{tableNote(dto)}</p>

      <section
        aria-label="Instructor Decision"
        style={{ border: `1.5px solid ${INK}`, padding: "0.1in 0.14in", marginTop: "0.16in", breakInside: "avoid" }}
      >
        <div style={{ fontWeight: 700, marginBottom: "0.06in" }}>Instructor Decision</div>
        {DECISIONS.map((label) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.09in", margin: "0.04in 0" }}>
            {/* An empty box, not a form control: nothing is ever pre-ticked. */}
            <span
              data-testid="decision-box"
              aria-hidden="true"
              style={{ display: "inline-block", width: "0.15in", height: "0.15in", border: `1.5px solid ${INK}`, flexShrink: 0 }}
            />
            <span>{label}</span>
          </div>
        ))}
        <div style={{ marginTop: "0.1in" }}>
          <span style={{ fontWeight: 700 }}>Remarks:</span>
          <div style={{ borderBottom: `1px solid ${INK}`, height: "0.24in" }} />
          <div style={{ borderBottom: `1px solid ${INK}`, height: "0.24in" }} />
        </div>
      </section>

      <section
        aria-label="Signatures"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.7fr", gap: "0.3in", marginTop: "0.38in", breakInside: "avoid" }}
      >
        <Signature caption="Prepared by (group leader)" name={dto.leaderName} />
        <Signature caption="Noted by (instructor)" name={null} />
        <Signature caption="Date" name={null} />
      </section>

      <footer
        style={{
          marginTop: "auto", paddingTop: "0.1in", borderTop: `1px solid ${RULE}`, fontSize: "8.5pt", color: GREY,
          display: "flex", justifyContent: "space-between", gap: "0.2in",
        }}
      >
        <span style={{ fontWeight: 700, color: INK }}>FAIRTRAZE AI</span>
        <span style={{ textAlign: "center" }}>The instructor can verify this report using the Report ID</span>
        <span>Page 1 of 1</span>
      </footer>
    </article>
  );
}

function Signature({ caption, name }: { caption: string; name: string | null }) {
  return (
    <div>
      <div style={{ borderBottom: `1px solid ${INK}`, height: "0.34in" }} />
      <div style={{ fontSize: "9pt", marginTop: "0.03in" }}>{caption}</div>
      {name && <div style={{ fontSize: "9pt", color: GREY }}>{name}</div>}
    </div>
  );
}
