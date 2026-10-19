import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "../router";
import { useAuth } from "../context/AuthContext";
import { roleHome } from "../lib/roleHome";
import { CARD, FOCUS_LIGHT } from "../components/ui";
import { studentHealthLabel } from "../lib/studentDisplay";
import {
  DEFAULT_WEIGHTS, FREE_RIDER_THRESHOLD, OVERLOAD_THRESHOLD, DEADLINE_DRIVEN_THRESHOLD,
  HEALTHY_GINI_THRESHOLD, MODERATE_RISK_GINI_THRESHOLD,
} from "@shared/scoring";
import { DOCUMENT_DEFAULT_WEIGHTS, TYPICAL_SESSION_CHARS_DEFAULT, MIN_ACTIVE_DAY_RETAINED_CHARS } from "@shared/documentScoring";
import { LINE_TYPE_WEIGHTS } from "@shared/lineClassifier";
import { DEFAULT_BLEND_WEIGHTS } from "@shared/combinedScoring";
import { FILE_WEIGHTS } from "@shared/fileWeights";
import {
  COMMIT_IMPACT, STRUCTURAL_NEW_FILES_THRESHOLD, STRUCTURAL_FILES_TOUCHED_THRESHOLD,
} from "@shared/commitClassifier";
import {
  EDIT_TYPE_WEIGHT, SUBSTANTIVE_MIN_CHARS, TRIVIAL_MAX_CHARS,
} from "@shared/editClassifier";
import { HELP_ANCHORS } from "../lib/helpText";

type View = "student" | "instructor";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const x1 = (x: number) => `${x.toFixed(1)}×`;

/** Every anchor id the app links to must exist here; HelpPage.test.tsx checks it. */
export const HELP_PAGE_ANCHORS = HELP_ANCHORS;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={`${CARD} scroll-mt-4 p-4`}>
      <h2 id={id} className="scroll-mt-4 text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-normal text-slate-800 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

function Rows({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="divide-y divide-slate-200 rounded-lg border border-slate-200">
      {rows.map(([term, desc], i) => (
        <div key={i} className="grid gap-1 px-3 py-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3">
          <dt className="font-semibold text-slate-900">{term}</dt>
          <dd className="text-slate-800">{desc}</dd>
        </div>
      ))}
    </dl>
  );
}

const LINK = `font-medium text-indigo-700 underline underline-offset-2 rounded ${FOCUS_LIGHT}`;

export function HelpPage() {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const home = roleHome(user?.systemRole);
  const [view, setView] = useState<View>(
    user?.systemRole === "INSTRUCTOR" || user?.systemRole === "ADMIN" ? "instructor" : "student",
  );
  const student = view === "student";

  // The page loads after React mounts, so the browser cannot jump to #section by itself.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  function goBack() {
    if (window.history.length > 1) window.history.back();
    else navigate(user ? home.route : "/");
  }

  const gh = DEFAULT_WEIGHTS;
  const docs = DOCUMENT_DEFAULT_WEIGHTS;
  const blend = DEFAULT_BLEND_WEIGHTS;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-4">
          <button
            type="button"
            onClick={goBack}
            className={`inline-flex items-center gap-1 min-h-9 text-sm text-slate-700 hover:text-slate-900 mb-1 rounded ${FOCUS_LIGHT}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-xl font-semibold text-slate-900">How FairTraze works</h1>
          <div role="group" aria-label="Show help for" className="mt-3 inline-flex rounded-lg border border-slate-300 bg-slate-50 p-0.5">
            {(["student", "instructor"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`min-h-9 rounded-md px-3 text-sm font-semibold ${FOCUS_LIGHT} ${
                  view === v ? "bg-indigo-700 text-white" : "text-slate-800 hover:bg-slate-200"
                }`}
              >
                {v === "student" ? "For students" : "For instructors"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-8 py-6 space-y-4 break-words">
        <nav aria-label="On this page" className={`${CARD} p-4`}>
          <p className="text-sm font-semibold text-slate-900">On this page</p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {[
              ["what", "What it does"], ["shares", "How shares are calculated"], ["flags", "What flags mean"],
              ["ai", "The AI"], ["tasks", "Tasks"], ["roles", "Roles and leaders"], ["notes", "Your notes"],
              ["privacy", "Privacy"], ["faq", "Questions"],
            ].map(([id, label]) => (
              <li key={id}><a className={LINK} href={`#${id}`}>{label}</a></li>
            ))}
          </ul>
        </nav>

        <Section id="what" title="What FairTraze does">
          <p>
            FairTraze helps instructors see who contributed what in a group project. It reads two kinds of recorded
            activity: commits on GitHub and writing in the group's FairTraze Docs document. It turns them into a fair,
            explained report.
          </p>
          <p>The report is evidence for the instructor. It is never a grade.</p>
        </Section>

        <Section id="shares" title="How shares are calculated">
          <p>
            Your <strong>share</strong> is your part of the group's total recorded work, as a percentage. Everyone's
            shares add up to 100%. In a group of 4 the <strong>equal share</strong> is 25% each, and the marker on each
            bar shows it. Being above or below the marker is not good or bad on its own.
          </p>

          <h3 id="shares-github" className="scroll-mt-4 font-semibold text-slate-900">GitHub</h3>
          <p>Three things are measured. Each becomes your fraction of the group's total, and then they are blended.</p>
          <Rows rows={[
            ["Commits", <>How many commits you made, on a log scale, so 100 tiny commits are worth far less than 100 times one commit. Default weight {pct(gh.commits)}.</>],
            ["Lines", <>Lines you added. Code lines count in full, comment lines count a quarter and blank lines count nothing; each is then worth more or less depending on the file type and on the commit it was in (see below). If you later delete lines that you added yourself, this drops by up to half, never to zero. Default weight {pct(gh.lines)}.</>],
            ["Active days", <>How many different days (in Philippine time) you made at least one commit. Default weight {pct(gh.activeDays)}.</>],
          ]} />
          <p>
            Your share = {pct(gh.commits)} × commits share + {pct(gh.lines)} × lines share + {pct(gh.activeDays)} × active-days share.
            Your instructor can change the weights.
          </p>
          <ul>
            <li>Merge commits are not counted, so merging a teammate's branch does not credit the merger with that work.</li>
            <li>Lines are measured from your newest 100 commits. The commit count and active days are not limited to 100.</li>
            <li>Only GitHub usernames in the group's member list are scored. Any other contributor is listed as unmatched.</li>
            <li>Work that leaves no trace (meetings, planning, working together on one computer, reviews done in person) cannot be seen.</li>
          </ul>

          <h3 id="shares-docs" className="scroll-mt-4 font-semibold text-slate-900">FairTraze Docs</h3>
          <p>The same idea, with three signals:</p>
          <Rows rows={[
            ["Kept text", <>Text you wrote that is still in the document. Text you typed and then deleted does not count, and writing then deleting your own text lowers this by up to half. Default weight {pct(docs.retainedText)}.</>],
            ["Editing sessions", <>A session is a stretch of editing that ends after 30 minutes without typing. Counted on a log scale, like commits. Default weight {pct(docs.sessions)}.</>],
            ["Active days", <>How many different days (in Philippine time) you wrote at least {MIN_ACTIVE_DAY_RETAINED_CHARS} characters that are still in the document. Default weight {pct(docs.activeDays)}.</>],
          ]} />
          <ul>
            <li>The colors in the document show who typed each part. Only the logged-in person is credited for typing.</li>
            <li>Formatting alone (bold, a heading style, a table's borders, an image, page layout) adds no text, so it earns no share. Inserted images are shown as a note and never scored.</li>
            <li>Text imported from a .docx counts as kept text. It earns some session credit in proportion to its size, but counts as one active day only (the day of upload), and the report says so.</li>
            <li>The system cannot tell typed text from pasted text. The instructor judges that.</li>
            <li>History, under the document, shows how the document looked each time the instructor analyzed the group. It is read-only.</li>
          </ul>

          <h3 id="combined" className="scroll-mt-4 font-semibold text-slate-900">Combined (GitHub and Docs)</h3>
          <p>
            When a project uses both, each source is scored on its own first. Then the combined share is the GitHub
            weight × your GitHub share + the Docs weight × your Docs share. The default is {pct(blend.wGitHub)} and{" "}
            {pct(blend.wDocs)}. If you did nothing in one source, that part is 0 and the other part still counts.
            Flags and team health come from the combined share, with commit times and editing times on one timeline.
          </p>

          <h3 id="settings" className="scroll-mt-4 font-semibold text-slate-900">Who can change the numbers</h3>
          <p>
            The weights, the blend and the three flag thresholds are settings on the project, and they apply to every
            group in it. Only the instructor who owns the class can change them. A saved report keeps the settings it
            was scored with. {student
              ? "Your instructor can adjust them to fit the course."
              : "Defaults are starting points. Adjust them to fit your course."}
          </p>

          {!student && (
            <details className="rounded-lg border border-slate-300 p-3">
              <summary className={`cursor-pointer font-semibold text-slate-900 rounded ${FOCUS_LIGHT}`}>Show the exact numbers</summary>
              <ul className="mt-2">
                <li>GitHub weights: commits {gh.commits}, lines {gh.lines}, active days {gh.activeDays}. Docs weights: kept text {docs.retainedText}, sessions {docs.sessions}, active days {docs.activeDays}. Blend: GitHub {blend.wGitHub}, Docs {blend.wDocs}.</li>
                <li>Log scale = ln(count + 1). Self-churn discount = 1 − 0.5 × ratio, so at most half.</li>
                <li>
                  File-type weight per added line: {Object.entries(FILE_WEIGHTS).map(([k, v]) => `${k} ${v}`).join(", ")}.
                  Line type weight per added line: code {LINE_TYPE_WEIGHTS.code}, comment {LINE_TYPE_WEIGHTS.comment}, blank {LINE_TYPE_WEIGHTS.blank}. A line is worth its line type weight × file-type weight × commit impact.
                </li>
                <li>
                  Commit impact multiplier: structural {x1(COMMIT_IMPACT.structural)} (creates {STRUCTURAL_NEW_FILES_THRESHOLD}+ new files or touches {STRUCTURAL_FILES_TOUCHED_THRESHOLD}+ files),
                  functional {x1(COMMIT_IMPACT.functional)}, cosmetic {x1(COMMIT_IMPACT.cosmetic)}, trivial {x1(COMMIT_IMPACT.trivial)}.
                  The member details panel explains each class.
                </li>
                <li>
                  Edit-type weight per kept character: substantive {x1(EDIT_TYPE_WEIGHT.substantive)} (new text of {SUBSTANTIVE_MIN_CHARS}+ characters), revision {x1(EDIT_TYPE_WEIGHT.revision)},
                  formatting {x1(EDIT_TYPE_WEIGHT.formatting)}, trivial {x1(EDIT_TYPE_WEIGHT.trivial)} (edits of {TRIVIAL_MAX_CHARS} characters or fewer).
                </li>
                <li>Imported .docx text becomes session credit at 1 session per {TYPICAL_SESSION_CHARS_DEFAULT} weighted characters.</li>
              </ul>
            </details>
          )}
        </Section>

        <Section id="flags" title="What flags mean">
          {student ? (
            <>
              <p>
                You may see a pill on your report. It describes a pattern in recorded activity. It is not a judgment of you.
              </p>
              <Rows rows={[
                ["Low contribution", <>Either nothing was recorded for you in the period, or your share is under about half of an equal split.</>],
                ["Overload", <>Your share is well above an equal split ({OVERLOAD_THRESHOLD}× or more by default). Your group may be leaning on you.</>],
                ["Deadline-driven", <>Most of your recorded activity ({pct(DEADLINE_DRIVEN_THRESHOLD)} or more by default) came in the last third of the time before the deadline. With no deadline, it is the last third of the group's activity.</>],
              ]} />
              <p id="gini" className="scroll-mt-4">
                How evenly work is shared in your group is shown in words: <strong>{studentHealthLabel("Healthy")}</strong>,{" "}
                <strong>{studentHealthLabel("Moderate Risk")}</strong> or <strong>{studentHealthLabel("High Risk")}</strong>.
                If nobody in the group has recorded activity yet, it says "Not enough activity yet".
              </p>
              <p>
                Your instructor and you can see your flags. If a flag misses context (work done offline, a different
                tool, helping others in person), add a note. See "Your notes" below.
              </p>
            </>
          ) : (
            <>
              <Rows rows={[
                ["inactive", <>No recorded commits (GitHub), no editing sessions (Docs), or neither (Combined).</>],
                ["free-rider", <>Not inactive, and contribution share below {FREE_RIDER_THRESHOLD}× the equal share.</>],
                ["overload", <>Contribution share above {OVERLOAD_THRESHOLD}× the equal share.</>],
                ["deadline-driven", <>Not inactive, and more than {pct(DEADLINE_DRIVEN_THRESHOLD)} of the member's recorded activity falls in the last third of the window. The window runs from the group's first recorded activity to the assignment deadline when one is set (activity after the deadline still counts), otherwise to the group's last recorded activity. The report states which basis was used.</>],
              ]} />
              <p id="gini" className="scroll-mt-4">
                Team health comes from the Gini coefficient of the members' shares (0 is perfectly equal, 1 is one
                person holding everything): <strong>Healthy</strong> below {HEALTHY_GINI_THRESHOLD}, <strong>Moderate risk</strong> from{" "}
                {HEALTHY_GINI_THRESHOLD} to below {MODERATE_RISK_GINI_THRESHOLD}, <strong>High risk</strong> at {MODERATE_RISK_GINI_THRESHOLD} or above.
                Students see plain words instead of the Gini value. When nobody has recorded activity the report says
                "Not enough activity yet" instead of a health label.
              </p>
              <p>
                The thresholds above are the defaults and can be changed per project (see "Who can change the numbers").
                Flags are set only by the formula; the AI never adds or removes one.
              </p>
            </>
          )}
        </Section>

        <Section id="ai" title="The math scores. The AI explains. The instructor decides.">
          <ul>
            <li><strong>The math scores.</strong> Every share, flag{student ? "" : ", Gini value"} and health label is worked out by a fixed formula. The same activity always gives the same result.</li>
            <li>
              <strong>The AI explains.</strong> When the instructor asks for it, an AI (Google Gemini) writes a short
              plain-language summary of numbers the formula already produced. It is told not to recompute anything, add
              or remove a flag, state thresholds, or judge the quality of anyone's work. Names are replaced by "Member A,
              B…" before anything is sent.
            </li>
            <li><strong>The AI never grades.</strong> The scores are worked out before the AI is asked, and they do not depend on it.</li>
            <li><strong>The instructor decides.</strong> Reports are evidence. Nothing here is a grade or a final assessment.</li>
          </ul>
          {student && <p>The AI summary is part of the instructor's report. The student view shows your own numbers and flags.</p>}
        </Section>

        <Section id="tasks" title="Tasks are planning only">
          <p>
            The Tasks board (Board, List and Calendar) helps your group plan who does what. Tasks, task counts, due
            dates, comments, files and linked commits never change any share, flag{student ? "" : ", Gini value"} or health label. A member
            with many tasks is not scored higher.
          </p>
          <p>
            Putting a task's key, such as FT-12, in a commit message links that commit to the task. Only the message is
            read, never the code.
          </p>
        </Section>

        <Section id="roles" title="Roles and the group leader">
          <p id="leader" className="scroll-mt-4">
            The person who creates the group is the <strong>leader</strong>. The leader links the repository, gives each
            member a label (Developer and/or Documentation) and is the instructor's contact. Leadership gives no extra
            credit and no protection from a flag. The leader is scored on their own activity like everyone else.
          </p>
          <p>
            Role labels are context only. They never change a share or a flag. A Developer with no commits, or a
            Documentation member with no editing sessions, gets a soft note on the report so the instructor can ask
            about it. Members can suggest a label for themselves, and the leader accepts or declines.
          </p>
          <p>
            Leaders can also see each member's share and open and done task counts, so the group can rebalance. Other
            members see only their own report.
          </p>
        </Section>

        <Section id="notes" title="Your notes: raising a concern about your report">
          {student ? (
            <>
              <p>
                If a flag or a number misses context, tell your instructor. On your group's Report tab, under a flag,
                choose <strong>Add a note</strong> and write what the system cannot see (for example, "I worked offline
                and pushed later"). Your instructor is notified, reads it and can reply, and you get a notification when
                they do.
              </p>
              <p>
                <strong>Your notes</strong> (in the left menu once you have sent one) lists every note with its status
                and reply: open, reviewed – accepted, or reviewed – upheld. You can have one open note per group at a time.
                A note is context for the instructor. It does not change your numbers.
              </p>
            </>
          ) : (
            <p>
              Students can add a note to a flag. Notes appear under Disputes with the flag, the student's text and a
              reply box. Marking one accepted or upheld records your decision and your reply, and notifies the
              student. It does not recompute the report.
            </p>
          )}
        </Section>

        <Section id="privacy" title="Privacy">
          <p>
            FairTraze uses your GitHub commit activity and your edits in the group document only to build your group's
            report. Your instructor sees it. Group members see their own report, and a leader also sees the team's
            shares. You can download your data or ask for deletion in Settings.
          </p>
          <p><a className={LINK} href="/privacy" onClick={(e) => { e.preventDefault(); navigate("/privacy"); }}>Read the full Privacy Notice</a></p>
        </Section>

        <Section id="faq" title="Questions students ask">
          <dl className="space-y-3">
            {[
              ["My share looks small although I worked a lot. Why?",
                "Your share compares you with the recorded work of the whole group. Work done offline, in meetings, on someone else's computer or in a tool FairTraze cannot see is invisible. Add a note and your instructor can take it into account."],
              ["Does making lots of commits or many small edits raise my share?",
                "Only a little. Commits and editing sessions are counted on a log scale, so extra tiny ones add little. Lines and kept text are worth more or less by file type and edit type, and writing then deleting your own work lowers your score."],
              ["Does the group leader get extra credit?",
                "No. Leadership is an administrative label. The leader is scored on their own activity only."],
              ["I only wrote in the document (or only coded). Is that a problem?",
                "No. In a project that uses both, the part you did not use counts as zero and the other part still counts. A soft note may appear if your role and your activity do not match."],
              ["Do tasks count toward my score?", "No. Tasks are planning only."],
              ["Does the AI decide my grade or my flags?",
                "No. A formula sets every number and flag. The AI only describes them for your instructor, and only when your instructor asks for it. Your instructor makes the final assessment."],
              ["When does my report update?",
                "When your instructor runs the analysis. The report shows the date it was last analyzed, and activity after that appears at the next analysis."],
              ["Who can see my report and my writing?",
                "You and your instructor see your report. A leader also sees team shares. Everyone in the group can see the shared document, including who wrote which part, and its comments."],
            ].map(([q, a]) => (
              <div key={q}>
                <dt className="font-semibold text-slate-900">{q}</dt>
                <dd className="mt-0.5 text-slate-800">{a}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="px-4 sm:px-8 py-3 text-xs text-slate-700 text-center">
          Outputs are evidence to support instructor judgment. They do not constitute grades or final assessments.
        </div>
      </footer>
    </div>
  );
}
