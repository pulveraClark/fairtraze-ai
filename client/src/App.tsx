import { useRouter } from "./router";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DemoPage } from "./pages/DemoPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { ClassPage } from "./pages/ClassPage";
import { AssignmentPage } from "./pages/AssignmentPage";
import { StudentPage } from "./pages/StudentPage";
import { StudentClassPage } from "./pages/StudentClassPage";
import { StudentGroupPage } from "./pages/StudentGroupPage";
import { AdminPage } from "./pages/AdminPage";
import { AuditLogPage } from "./pages/AuditLogPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AlertsPage } from "./pages/AlertsPage";
import { DisputesPage } from "./pages/DisputesPage";
import { ProtectedRoute } from "./components/ProtectedRoute";

export default function App() {
  const { pathname } = useRouter();

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

  if (pathname === "/login")     return <LoginPage />;
  if (pathname === "/register")  return <RegisterPage />;
  if (pathname === "/overview")  return <OverviewPage />;

  if (pathname === "/dashboard") return (
    <ProtectedRoute allowedRoles={["INSTRUCTOR"]}>
      <DemoPage />
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
