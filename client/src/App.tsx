import { lazy, Suspense } from "react";
import { useRouter } from "./router";
import { ProtectedRoute } from "./components/ProtectedRoute";

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
const DisputesPage = lazy(() => import("./pages/DisputesPage").then((m) => ({ default: m.DisputesPage })));
const JoinPage = lazy(() => import("./pages/JoinPage").then((m) => ({ default: m.JoinPage })));

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--brand-bg-light)" }}>
      <span className="h-5 w-5 rounded-full border-2 border-amber-400/40 border-t-amber-400 animate-spin" />
    </div>
  );
}

function routeElement(pathname: string) {
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
  if (pathname === "/forgot-password") return <ForgotPasswordPage />;
  if (pathname === "/reset-password")  return <ResetPasswordPage />;
  if (pathname === "/verify-email")    return <VerifyEmailPage />;
  if (pathname === "/overview")  return <OverviewPage />;

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
    <ProtectedRoute allowedRoles={["INSTRUCTOR"]}>
      <AlertsPage />
    </ProtectedRoute>
  );

  if (pathname === "/disputes") return (
    <ProtectedRoute allowedRoles={["INSTRUCTOR"]}>
      <DisputesPage />
    </ProtectedRoute>
  );

  return <LandingPage />;
}

export default function App() {
  const { pathname } = useRouter();

  return (
    <Suspense fallback={<RouteFallback />}>
      {routeElement(pathname)}
    </Suspense>
  );
}
