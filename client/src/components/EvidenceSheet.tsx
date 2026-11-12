import type { CSSProperties, ReactNode } from "react";
import { EVIDENCE_UNIVERSITY_NAME, type EvidenceReportDto } from "@shared/evidenceReport";
import { contributionStatus } from "@shared/contributionStatus";
import { flagsText, manilaDate, pctText, repoShort, sourcesText, tableNote } from "../lib/evidenceText";
import { giniBands } from "../lib/giniBands";
import { pageLabel, sheetDensity, type BulkPosition } from "../lib/evidenceLayout";
import type { TeamHealth } from "@shared/types";

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
    <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "auto" }}>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            {/* Labels never wrap; a value wraps only when it really does not fit its column. */}
            <td style={{ fontWeight: 700, whiteSpace: "nowrap", paddingRight: "0.14in", paddingBottom: "0.02in", verticalAlign: "top", width: "1%" }}>{r.label}</td>
            <td style={{ fontWeight: r.bold ? 700 : 400, paddingBottom: "0.02in", minWidth: 0, overflowWrap: "anywhere" }}>{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Only the instructor copy passes this. The student sheet must never receive it. */
export interface InstructorCopy {
  gini: number;
  teamHealth: TeamHealth;
  /** The Report ID already made for this analysis, or null ("Not issued"). Never minted here. */
  reportId: string | null;
  /** Set by the bulk export: this sheet's place among the sheets. */
  bulk?: BulkPosition;
}

/** "Healthy", "Moderate" or "High": the first word of the band's label from giniBands(). */
export function giniBandWord(health: TeamHealth): string {
  const band = giniBands().find((b) => b.health === health);
  return (band?.label ?? "").split(" ")[0];
}

export function EvidenceSheet({ dto, instructor }: { dto: EvidenceReportDto; instructor?: InstructorCopy }) {
  const showGithub = dto.sourceType !== "EDITOR";
  const showDocs = dto.sourceType !== "GITHUB";
  const repo = dto.sourceType === "EDITOR" ? "Not applicable" : repoShort(dto.repoUrl);
  const compact = sheetDensity(dto.members.length) === "compact";
  const cell: CSSProperties = {
    padding: compact ? "1px 0.14in 1px 6px" : "4px 0.14in 4px 6px", verticalAlign: "top", borderBottom: `1px solid ${RULE}`,
  };
  const numCell: CSSProperties = { ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" };
  const head: CSSProperties = {
    padding: compact ? "2px 0.14in 2px 6px" : "4px 0.14in 4px 6px", textAlign: "left", fontWeight: 700,
    borderTop: `1.5px solid ${INK}`, borderBottom: `1.5px solid ${INK}`,
  };
  const last = dto.members.length - 1;
  const reportId = instructor ? instructor.reportId : dto.reportId;

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
        {instructor && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.06in" }}>
            <span
              data-testid="instructor-tag"
              style={{ border: `1.5px solid ${INK}`, padding: "1px 8px", fontSize: "8.5pt", fontWeight: 700, letterSpacing: "0.06em" }}
            >
              INSTRUCTOR COPY
            </span>
          </div>
        )}
        <div data-testid="university-line" style={{ fontSize: "12pt", fontWeight: 400, textTransform: "uppercase", letterSpacing: "0.08em" }}>{EVIDENCE_UNIVERSITY_NAME}</div>
        {dto.collegeName && <div data-testid="college-line" style={{ fontSize: "10.5pt", fontWeight: 400, color: GREY }}>{dto.collegeName}</div>}
        <h1 style={{ fontSize: "16pt", fontWeight: 700, margin: "0.08in 0 0.02in" }}>Contribution Evidence Report</h1>
        <div style={{ fontSize: "11pt" }}>{dto.groupName}</div>
      </header>

      <div style={{ marginTop: "0.12in", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", columnGap: "0.3in" }}>
        <InfoColumn
          rows={[
            { label: "Class", value: dto.className },
            { label: "Project", value: dto.projectTitle },
            { label: "Repository", value: repo },
            { label: "Contribution status", value: contributionStatus(dto.members) },
            ...(instructor
              ? [{ label: "Gini index", value: `${instructor.gini.toFixed(3)} (${giniBandWord(instructor.teamHealth)})` }]
              : []),
          ]}
        />
        <InfoColumn
          rows={[
            { label: "Analyzed", value: manilaDate(dto.analyzedAt) },
            { label: "Generated", value: manilaDate(dto.generatedAt) },
            { label: "Sources", value: sourcesText(dto.sourceType) },
            { label: "Report ID", value: reportId || "Not issued", bold: !!reportId },
          ]}
        />
      </div>

      <p style={{ fontWeight: 400, margin: "0.14in 0 0.05in" }}><strong style={{ fontWeight: 700 }}>Table 1.</strong> Recorded contribution and flags per member.</p>
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
        {instructor ? (
          <span data-testid="instructor-footer">
            <span style={{ fontWeight: 700, color: INK }}>FAIRTRAZE AI</span>
            {" · Instructor copy"}
            {instructor.reportId ? ` · Report ID ${instructor.reportId}` : ""}
          </span>
        ) : (
          <>
            <span style={{ fontWeight: 700, color: INK }}>FAIRTRAZE AI</span>
            <span style={{ textAlign: "center" }}>The instructor can verify this report using the Report ID</span>
          </>
        )}
        <span>{pageLabel(dto.members.length, instructor?.bulk)}</span>
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
