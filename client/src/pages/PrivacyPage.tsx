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
            <li><strong>Reports:</strong> contribution scores and flags, all computed from the activity above, and AI findings. The AI findings are a written explanation of the scores and flags and, when your instructor has it switched on for the class, a short note on what each member worked on and a check of the group's work against the project instructions. AI findings can be wrong. They never change a score or a flag, and they are never used as a grade.</li>
            <li><strong>Project instructions:</strong> the text your instructor writes and the PDF and images attached to it. They are kept in our database until your instructor removes them or deletes the project. Students in the class can open them, and the AI reads them for the project instructions check. Instructors should not attach personal data or passwords.</li>
            <li><strong>Instructions check marks:</strong> when the AI could not confirm a requirement of the project instructions, the group leader and the class instructor can add a short note (up to 140 characters) and one screenshot (JPEG, PNG or WebP, up to 1 MB) to say where it is or that they checked. Only your group's members and the class instructor can see them, they are never used in any score or sent to Google, and they are deleted with the group. A screenshot can show anything on the screen, so please show only the work.</li>
            <li><strong>Other records:</strong> tasks assigned to or created by you (including their assignments, due dates, subtasks, comments, history, files attached to them, and the GitHub commit links that name them, which keep the commit message and author login), notes you submit when you flag a report for review, notifications sent to you (and a log of the due-date reminders sent, so none is sent twice), and an audit log of administrative actions.</li>
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
            <li><strong>Instructor</strong> (of the class): the class roster, every group member's contribution report, scores and flags, the AI findings (the written explanation and the note on every member), the project instructions check (including which attached files the AI read and which it skipped), tasks, the notes members submit, and the group's document.</li>
            <li><strong>Group leader:</strong> in addition to their own report, a team view for their group showing each member's contribution share, GitHub/Docs split, flags and open and done task counts, the AI findings for every member and the project instructions check for their group (with file names and document section headings as proof, never another member's document text; it also says which attached files the AI read or skipped). Never notes to the instructor or instructor comments.</li>
            <li><strong>Group members:</strong> their own report, flags and AI findings only, not other members' scores or findings. They can open the project instructions and the files attached to them, and the AI reads those files too (one PDF and up to three images). All members of a group can see the shared document, including who wrote which text (authorship colors), and the comments in it.</li>
            <li><strong>Administrators:</strong> account details (name, email, role), the audit log, and class and group reports for oversight.</li>
          </ul>
          <p>We do not sell your data and do not use it for advertising.</p>
        </Section>

        <Section id="processors" title="Third parties that process data for us">
          <ul>
            <li><strong>Google Gemini</strong> writes the AI findings: a plain-language explanation of a report and, when your instructor has this switched on for the class, a short note on what each member worked on and a check of the group's work against the project instructions. For the explanation it receives pseudonyms ("Member A", "Member B", …) instead of names, no email addresses and no GitHub usernames, together with the already-computed scores, flags, team-level figures, the group name and the first 1,500 characters of the written project instructions. For the note on each member it also receives the beginning of that member's commit messages (up to 300 characters), short excerpts of the lines they changed in the repository, including lines that were removed (not whole repositories; generated, lock and binary files are skipped), and their own text in the group's document. For the project instructions check it receives the whole written project instructions, the files attached to them (one PDF and up to three images, PNG, JPEG or WebP), the list of file names in the repository (up to 300), the first 2,000 characters of up to 12 of its main files, and the group's document shortened to 12,000 characters. The PDF is sent as it was uploaded. Images were resized and re-encoded by the browser when they were uploaded, and the resized image is what is sent. Email addresses and anything that looks like a password or key are removed from written text before sending, but this removal is not perfect, and it cannot be done inside attached files, so names, emails or keys inside a file are sent as they are. Please never put secrets in a repository, a document or an attached file. Real names are put back in the text only on our server. Google does not decide any score. In this capstone demonstration we use Google's free Gemini API tier with the capstone team's own data; under the free tier Google may use what it receives to improve its products, and a production deployment would use the paid tier, whose terms do not allow that. Google processes this data outside the Philippines.</li>
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
