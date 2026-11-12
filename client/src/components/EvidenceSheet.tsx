import type { CSSProperties, ReactNode } from "react";
import { EVIDENCE_UNIVERSITY_NAME, type EvidenceReportDto } from "@shared/evidenceReport";
import { contributionStatus } from "@shared/contributionStatus";
import { flagsText, manilaDate, pctText, repoShort, sourcesText, tableNote } from "../lib/evidenceText";
import { pageLabel, sheetDensity } from "../lib/evidenceLayout";

// The one-page Contribution Evidence Report as it prints: Letter, serif, black and grey only.
// Evidence, not a grade: the Instructor Decision boxes are always empty and nothing suggests an outcome.
// Nothing here may show Gini, bands, team health, thresholds, AI text, usernames, emails or raw counts.

const INK = "#111111";
const GREY = "#555555";
const RULE = "#d4d4d4";

const DECISIONS = [
  "Same grade for all members",
  "Individual grades based on the contribution evidence",
  "Needs further review",
];

function InfoColumn({ rows }: { rows: Array<{ label: string; value: ReactNode; bold?: boolean }> }) {
  return (
    <table style={{ borderCollapse: "collapse", width: "100%" }}>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td style={{ fontWeight: 700, whiteSpace: "nowrap", paddingRight: "0.14in", paddingBottom: "0.02in", verticalAlign: "top" }}>{r.label}:</td>
            <td style={{ fontWeight: r.bold ? 700 : 400, paddingBottom: "0.02in", wordBreak: "break-word" }}>{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function EvidenceSheet({ dto }: { dto: EvidenceReportDto }) {
  const showGithub = dto.sourceType !== "EDITOR";
  const showDocs = dto.sourceType !== "GITHUB";
  const repo = dto.sourceType === "EDITOR" ? "Not applicable" : repoShort(dto.repoUrl);
  const compact = sheetDensity(dto.members.length) === "compact";
  const cell: CSSProperties = {
    padding: compact ? "1px 6px" : "4px 6px", verticalAlign: "top", borderBottom: `1px solid ${RULE}`,
  };
  const numCell: CSSProperties = { ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" };
  const head: CSSProperties = {
    padding: compact ? "2px 6px" : "4px 6px", textAlign: "left", fontWeight: 700,
    borderTop: `1.5px solid ${INK}`, borderBottom: `1.5px solid ${INK}`,
  };
  const last = dto.members.length - 1;

  return (
    <article
      className="ft-evidence-sheet"
      aria-label="Contribution Evidence Report"
      style={{
        fontFamily: 'Georgia, "Times New Roman", Times, serif', color: INK, background: "#ffffff",
        fontSize: compact ? "9.5pt" : "10.5pt", lineHeight: compact ? 1.25 : 1.35,
      }}
    >
      <header style={{ textAlign: "center", borderBottom: `2px solid ${INK}`, paddingBottom: "0.1in" }}>
        <div style={{ fontSize: "12pt", fontWeight: 700, letterSpacing: "0.02em" }}>{EVIDENCE_UNIVERSITY_NAME}</div>
        <div style={{ fontSize: "10.5pt", color: GREY }}>{dto.collegeName}</div>
        <h1 style={{ fontSize: "16pt", fontWeight: 700, margin: "0.08in 0 0.02in" }}>Contribution Evidence Report</h1>
        <div style={{ fontSize: "11pt" }}>{dto.groupName}</div>
      </header>

      <div style={{ marginTop: "0.12in", display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "0.3in" }}>
        <InfoColumn
          rows={[
            { label: "Class", value: dto.className },
            { label: "Project", value: dto.projectTitle },
            { label: "Repository", value: repo },
            { label: "Contribution status", value: contributionStatus(dto.members) },
          ]}
        />
        <InfoColumn
          rows={[
            { label: "Analyzed", value: manilaDate(dto.analyzedAt) },
            { label: "Generated", value: manilaDate(dto.generatedAt) },
            { label: "Sources", value: sourcesText(dto.sourceType) },
            { label: "Report ID", value: dto.reportId, bold: true },
          ]}
        />
      </div>

      <p style={{ fontWeight: 700, margin: "0.14in 0 0.05in" }}>Table 1. Recorded contribution and flags per member.</p>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={head} scope="col">Member</th>
            {showGithub && <th style={{ ...head, textAlign: "right" }} scope="col">GitHub</th>}
            {showDocs && <th style={{ ...head, textAlign: "right" }} scope="col">Documents</th>}
            <th style={{ ...head, textAlign: "right" }} scope="col">Combined</th>
            <th style={head} scope="col">Flags</th>
          </tr>
        </thead>
        <tbody>
          {dto.members.map((m, i) => {
            const edge = i === last ? { borderBottom: `1.5px solid ${INK}` } : null;
            return (
              <tr key={`${m.name}-${i}`} style={{ breakInside: "avoid" }}>
                <td style={{ ...cell, ...edge }}>{m.name}</td>
                {showGithub && <td style={{ ...numCell, ...edge }}>{m.githubPct === null ? "—" : pctText(m.githubPct)}</td>}
                {showDocs && <td style={{ ...numCell, ...edge }}>{m.docsPct === null ? "—" : pctText(m.docsPct)}</td>}
                <td style={{ ...numCell, ...edge, fontWeight: 700 }}>{pctText(m.combinedPct)}</td>
                <td style={{ ...cell, ...edge }}>{flagsText(m.flags)}</td>
              </tr>
            );
          })}
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
        <span>{pageLabel(dto.members.length)}</span>
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
