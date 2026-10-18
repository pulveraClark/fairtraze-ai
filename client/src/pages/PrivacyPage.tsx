import type { ReactNode } from "react";
import { useRouter } from "../router";
import { useAuth } from "../context/AuthContext";
import { roleHome } from "../lib/roleHome";
import { CARD } from "../components/ui";
import {
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_NOTICE_UPDATED,
  PRIVACY_NOTICE_VERSION,
  PRIVACY_RETENTION,
} from "@shared/privacyNotice";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={`${CARD} p-4`}>
      <h2 id={id} className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-normal text-slate-800 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

const LINK = "font-medium text-indigo-700 underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600";

/** Public Privacy Notice (RA 10173). Version and date come from shared/src/privacyNotice.ts. */
export function PrivacyPage() {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const home = roleHome(user?.systemRole);

  function goBack() {
    if (window.history.length > 1) window.history.back();
    else navigate(user ? home.route : "/");
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-4">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-1 min-h-9 text-sm text-slate-700 hover:text-slate-900 mb-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-xl font-semibold text-slate-900">Privacy Notice</h1>
          <p className="mt-0.5 text-sm text-slate-700">
            Version {PRIVACY_NOTICE_VERSION} · Last updated {PRIVACY_NOTICE_UPDATED}
          </p>
        </div>
      </div>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-8 py-6 space-y-4 break-words">
        <Section id="who" title="Who we are">
          <p>
            FAIR TRAZE AI is a capstone project of students at UCLM.
            It helps instructors assess individual contributions in group projects fairly. We handle your personal
            data in line with the Data Privacy Act of 2012 (Republic Act No. 10173).
          </p>
          <p>
            Questions or requests about your data:{" "}
            <a className={LINK} href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>{PRIVACY_CONTACT_EMAIL}</a>
          </p>
        </Section>

        <Section id="collect" title="What we collect, and why">
          <p>
            Purpose: to give instructors evidence for assessing each member's contribution to a group project.
            The system supports the instructor's judgment. It never assigns grades.
          </p>
          <ul>
            <li><strong>Account:</strong> your name, email address, role (student, instructor or admin), a securely hashed password, and optionally your GitHub username and a profile photo.</li>
            <li><strong>Group membership:</strong> the classes and groups you join, whether you are the group leader, and your group role (Developer and/or Documentation).</li>
            <li><strong>GitHub activity</strong> (for GitHub and Combined projects): commit counts and dates, lines added and deleted, and the types of files changed in your group's repository, read from GitHub's API.</li>
            <li><strong>Collaborative Editor activity</strong> (for Editor and Combined projects): what you insert and delete in your group's document, with timestamps and editing sessions, plus the comments you write.</li>
            <li><strong>Reports:</strong> contribution scores, flags and an AI-written explanation computed from the activity above.</li>
            <li><strong>Other records:</strong> tasks assigned to or created by you (including their subtasks, comments, history, files attached to them and the GitHub commit messages that name them), notes you submit when you flag a report for review, notifications sent to you, and an audit log of administrative actions.</li>
            <li><strong>Consent record:</strong> the notice version you accepted and when.</li>
          </ul>
        </Section>

        <Section id="basis" title="Legal basis: your consent">
          <p>
            We process your data on the basis of your consent, given when you create an account (or when you accept an
            updated notice). When this notice changes materially we ask you to accept it again before you continue.
            You may withdraw consent by requesting account deletion (see below).
          </p>
        </Section>

        <Section id="access" title="Who can see what">
          <ul>
            <li><strong>Instructor</strong> (of the class): the class roster, every group member's contribution report, scores and flags, the AI explanation, tasks, the notes members submit, and the group's document.</li>
            <li><strong>Group leader:</strong> in addition to their own report, a team view for their group showing each member's contribution share, GitHub/Docs split, flags and open and done task counts. Never notes to the instructor or instructor comments.</li>
            <li><strong>Group members:</strong> their own report and flags only, not other members' scores. All members of a group can see the shared document, including who wrote which text (authorship colors), and the comments in it.</li>
            <li><strong>Administrators:</strong> account details (name, email, role), the audit log, and class and group reports for oversight.</li>
          </ul>
          <p>We do not sell your data and do not use it for advertising.</p>
        </Section>

        <Section id="processors" title="Third parties that process data for us">
          <ul>
            <li><strong>Google Gemini</strong> writes the plain-language explanation of a report. It receives pseudonyms ("Member A", "Member B", …) instead of names, no email addresses and no GitHub usernames, together with the already-computed scores, flags, team-level figures, the group name and the instructor's assignment description. Real names are put back in the text only on our server. Google does not decide any score.</li>
            <li><strong>Render</strong> hosts the application servers.</li>
            <li><strong>Neon</strong> hosts the database where all of the data above is stored.</li>
            <li><strong>GitHub</strong> is read through its API, read-only, for the repository your group registered. Nothing is written to GitHub.</li>
          </ul>
        </Section>

        <Section id="retention" title="How long we keep your data">
          <p>
            We keep your data {PRIVACY_RETENTION}.
          </p>
        </Section>

        <Section id="deletion" title="How deletion works">
          <p>
            You can request deletion in Settings, under Privacy and data. An administrator reviews the request. When it
            is approved:
          </p>
          <ul>
            <li>your name, email, GitHub username, profile photo and password are removed and you can no longer sign in;</li>
            <li>your contributions are <strong>anonymized, not deleted</strong>: they remain as "Former member" so your teammates' reports and scores stay correct;</li>
            <li>text you typed stays in your group's shared document, but is no longer linked to your name;</li>
            <li>files attached to tasks (images and PDFs) are <strong>kept</strong> as your group's work, because removing them would damage your teammates' tasks; the file name no longer carries your name, and the file is no longer linked to you;</li>
            <li>your notes to the instructor, notifications and group requests are deleted, and the audit log keeps what happened and when, without your name or email.</li>
          </ul>
          <p>
            A group leader or an instructor who still owns classes must first hand those over. Names a person wrote
            in free text (for example inside someone else's comment) may not all be found automatically.
          </p>
        </Section>

        <Section id="rights" title="Your rights under RA 10173">
          <ul>
            <li><strong>To be informed</strong> about how your data is processed. This notice does that.</li>
            <li><strong>To access</strong> your data, and to <strong>data portability</strong>: use "Download my data" in Settings, under Privacy and data, for a JSON file of your own data.</li>
            <li><strong>To object</strong> to processing, including withdrawing consent, by contacting us or requesting deletion.</li>
            <li><strong>To rectification:</strong> correct your name and GitHub username in Settings, under Profile, or contact us.</li>
            <li><strong>To erasure or blocking:</strong> request account deletion in Settings.</li>
            <li><strong>To be indemnified</strong> for damages caused by inaccurate, unlawfully obtained or unauthorized use of your data.</li>
            <li><strong>To file a complaint</strong> with the National Privacy Commission (NPC):{" "}
              <a className={LINK} href="https://privacy.gov.ph" target="_blank" rel="noopener noreferrer">privacy.gov.ph</a>.
            </li>
          </ul>
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
