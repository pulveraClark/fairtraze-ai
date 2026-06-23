import { useEffect } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "../router";

type SystemRole = "ADMIN" | "INSTRUCTOR" | "STUDENT";

interface Props {
  children: ReactNode;
  allowedRoles?: SystemRole[];
}

function roleHome(role: SystemRole): string {
  if (role === "STUDENT") return "/student";
  if (role === "ADMIN")   return "/admin";
  return "/dashboard";
}

export function ProtectedRoute({ children, allowedRoles }: Props) {
  const { user, loading } = useAuth();
  const { pathname, navigate } = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      localStorage.setItem("ft_next", pathname);
      navigate("/login");
    } else if (allowedRoles && !allowedRoles.includes(user.systemRole)) {
      navigate(roleHome(user.systemRole));
    }
  }, [loading, user, pathname, navigate, allowedRoles]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0b0d1a" }}>
        <span className="h-5 w-5 rounded-full border-2 border-amber-400/40 border-t-amber-400 animate-spin" />
      </div>
    );
  }

  if (!user) return null;
  if (allowedRoles && !allowedRoles.includes(user.systemRole)) return null;

  return <>{children}</>;
}
