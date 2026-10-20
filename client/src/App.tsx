import { lazy, Suspense } from "react";
import { useRouter } from "./router";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppShell } from "./components/layout/AppShell";
import { useAuth } from "./context/AuthContext";
import { EmailOnlyRoute } from "./components/EmailOnlyRoute";

const LandingPage = lazy(() => import("./pages/LandingPage").then((m) => ({ default: m.LandingPage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("./pages/RegisterPage").then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })));
const VerifyEmailPage = lazy(() => import("./pages/VerifyEmailPage").then((m) => ({ default: m.VerifyEmailPage })));
const InstructorDashboardPage = lazy(() => import("./pages/InstructorDashboardPage").then((m) => ({ default: m.InstructorDashboardPage })));
const OverviewPage = lazy(() => import("./pages/OverviewPage").then((m) => ({ default: m.OverviewPage })));
const ProjectDetailPage = lazy(() => import("./pages/ProjectDetailPage").then((m) => ({ default: m.ProjectDetailPage })));
const ClassPage = lazy(() => import("./pages/ClassPage").then((m) => ({ default: m.ClassPage })));
const AssignmentPage = lazy(() => import("./pages/AssignmentPage").then((m) => ({ default: m.AssignmentPage })));
const StudentPage = lazy(() => import("./pages/StudentPage").then((m) => ({ default: m.StudentPage })));
const StudentClassPage = lazy(() => import("./pages/StudentClassPage").then((m) => ({ default: m.StudentClassPage })));
const StudentGroupPage = lazy(() => import("./pages/StudentGroupPage").then((m) => ({ default: m.StudentGroupPage })));
const AdminPage = lazy(() => import("./pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const AuditLogPage = lazy(() => import("./pages/AuditLogPage").then((m) => ({ default: m.AuditLogPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const AlertsPage = lazy(() => import("./pages/AlertsPage").then((m) => ({ default: m.AlertsPage })));
const StudentNotesPage = lazy(() => import("./pages/StudentNotesPage").then((m) => ({ default: m.StudentNotesPage })));
const DisputesPage = lazy(() => import("./pages/DisputesPage").then((m) => ({ default: m.DisputesPage })));
const PendingApprovalPage = lazy(() => import("./pages/PendingApprovalPage").then((m) => ({ default: m.PendingApprovalPage })));
const HelpPage = lazy(() => import("./pages/HelpPage").then((m) => ({ default: m.HelpPage })));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage").then((m) => ({ default: m.PrivacyPage })));
const ConsentGatePage = lazy(() => import("./pages/ConsentGatePage").then((m) => ({ default: m.ConsentGatePage })));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })));
const JoinPage = lazy(() => import("./pages/JoinPage").then((m) => ({ default: m.JoinPage })));

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--brand-bg-light)" }}>
      <span className="h-5 w-5 rounded-full border-2 border-amber-400/40 border-t-amber-400 animate-spin" />
    </div>
  );
}

function routeElement(pathname: string, signedIn: boolean) {
  const page = pageElement(pathname);
  if (page === null) return <NotFoundPage />;
  return usesShell(pathname, signedIn) ? <AppShell>{page}</AppShell> : page;
}

/**
 * Signed-in app routes get the sidebar; landing and auth pages never had the app chrome.
 * /help is the one page that depends on who is looking: signed-in users get it inside the shell
 * (sidebar, Help highlighted), visitors keep the standalone page.
 */
export function usesShell(pathname: string, signedIn = false): boolean {
  if (pathname === "/help") return signedIn;
  return !["/", "/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/privacy"].includes(pathname);
}

/** The page for a known route, or null when nothing matches (rendered as "Page not found"). */
function pageElement(pathname: string) {
  // Dynamic route: /project/:id (instructor only)
  const detailMatch = pathname.match(/^\/project\/(\d+)$/);
  if (detailMatch) {
    return (
      <ProtectedRoute allowedRoles={["INSTRUCTOR", "ADMIN"]}>
        <ProjectDetailPage projectId={parseInt(detailMatch[1], 10)} />
      </ProtectedRoute>
    );
  }

  // Dynamic route: /class/:classId/assignment/:assignmentId
  const assignmentMatch = pathname.match(/^\/class\/(\d+)\/assignment\/(\d+)$/);
  if (assignmentMatch) {
    return (
      <ProtectedRoute allowedRoles={["INSTRUCTOR", "ADMIN"]}>
        <AssignmentPage
          classId={parseInt(assignmentMatch[1], 10)}
          assignmentId={parseInt(assignmentMatch[2], 10)}
        />
      </ProtectedRoute>
    );
  }

  // Dynamic route: /class/:classId
  const classMatch = pathname.match(/^\/class\/(\d+)$/);
  if (classMatch) {
    return (
      <ProtectedRoute allowedRoles={["INSTRUCTOR", "ADMIN"]}>
        <ClassPage classId={parseInt(classMatch[1], 10)} />
      </ProtectedRoute>
    );
  }

  if (pathname === "/join")      return <JoinPage />;
  if (pathname === "/login")     return <LoginPage />;
  if (pathname === "/register")  return <RegisterPage />;
  if (pathname === "/forgot-password") return <EmailOnlyRoute><ForgotPasswordPage /></EmailOnlyRoute>;
  if (pathname === "/reset-password")  return <EmailOnlyRoute><ResetPasswordPage /></EmailOnlyRoute>;
  if (pathname === "/verify-email")    return <EmailOnlyRoute><VerifyEmailPage /></EmailOnlyRoute>;
  if (pathname === "/overview")  return <OverviewPage />;
  if (pathname === "/privacy")   return <PrivacyPage />;
  if (pathname === "/help")      return <HelpPage />;

  if (pathname === "/dashboard") return (
    <ProtectedRoute allowedRoles={["INSTRUCTOR"]}>
      <InstructorDashboardPage />
    </ProtectedRoute>
  );

  if (pathname === "/admin") return (
    <ProtectedRoute allowedRoles={["ADMIN"]}>
      <AdminPage />
    </ProtectedRoute>
  );

  if (pathname === "/admin/audit") return (
    <ProtectedRoute allowedRoles={["ADMIN"]}>
      <AuditLogPage />
    </ProtectedRoute>
  );

  // Dynamic route: /student/group/:id (student only)
  const studentGroupMatch = pathname.match(/^\/student\/group\/(\d+)$/);
  if (studentGroupMatch) {
    return (
      <ProtectedRoute allowedRoles={["STUDENT"]}>
        <StudentGroupPage projectId={parseInt(studentGroupMatch[1], 10)} />
      </ProtectedRoute>
    );
  }

  // Dynamic route: /student/class/:id (student only)
  const studentClassMatch = pathname.match(/^\/student\/class\/(\d+)$/);
  if (studentClassMatch) {
    return (
      <ProtectedRoute allowedRoles={["STUDENT"]}>
        <StudentClassPage classId={parseInt(studentClassMatch[1], 10)} />
      </ProtectedRoute>
    );
  }

  if (pathname === "/student") return (
    <ProtectedRoute allowedRoles={["STUDENT"]}>
      <StudentPage />
    </ProtectedRoute>
  );

  if (pathname === "/settings") return (
    <ProtectedRoute>
      <SettingsPage />
    </ProtectedRoute>
  );

  if (pathname === "/alerts") return (
    <ProtectedRoute>
      <AlertsPage />
    </ProtectedRoute>
  );

  if (pathname === "/disputes") return (
    <ProtectedRoute allowedRoles={["INSTRUCTOR", "STUDENT"]}>
      <DisputesRoute />
    </ProtectedRoute>
  );

  if (pathname === "/") return <LandingPage />;

  return null;
}

/** /disputes: instructors review student notes; students see their own notes and the replies. */
function DisputesRoute() {
  const { user } = useAuth();
  return user?.systemRole === "STUDENT" ? <StudentNotesPage /> : <DisputesPage />;
}

export default function App() {
  const { pathname } = useRouter();
  const { user, loading } = useAuth();

  // Everyone must accept the current Privacy Notice first (RA 10173). The public notice itself
  // (/privacy) never uses the shell, so it stays readable from the consent screen; /help is
  // exempt the same way (signedIn=false), so people can read Help before they accept.
  const consentGated = !loading && !!user && user.consentRequired === true && usesShell(pathname);

  // An instructor an admin has not approved yet sees only the approval notice, never the app
  // shell or any instructor page. The server enforces the same rule on every instructor API.
  const gated =
    !loading && user?.systemRole === "INSTRUCTOR" && user.instructorStatus !== undefined &&
    user.instructorStatus !== "APPROVED" && usesShell(pathname, true);

  return (
    <Suspense fallback={<RouteFallback />}>
      {consentGated ? <ConsentGatePage /> : gated ? <PendingApprovalPage /> : routeElement(pathname, !loading && !!user)}
    </Suspense>
  );
}
