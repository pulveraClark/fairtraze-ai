import { useAuth } from "../context/AuthContext";
import { useRouter } from "../router";
import { roleHome } from "../lib/roleHome";
import { BUTTON_PRIMARY } from "../components/ui/styles";

/** Shown for any address the app does not have a page for. One clear way back. */
export function NotFoundPage() {
  const { user, loading } = useAuth();
  const { navigate } = useRouter();
  const home = user ? roleHome(user.systemRole) : { route: "/" as const, label: "Home" };
  const buttonLabel = user ? "Go to your dashboard" : "Go to the home page";

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm text-center space-y-4">
        <p className="text-sm font-semibold text-indigo-600">Error 404</p>
        <h1 className="text-xl font-semibold text-slate-900">Page not found</h1>
        <p className="text-sm text-slate-600">
          This address does not match a page in FairTraze AI. The link may be mistyped or out of date.
        </p>
        <button
          type="button"
          disabled={loading}
          onClick={() => navigate(home.route)}
          className={BUTTON_PRIMARY}
        >
          {buttonLabel}
        </button>
      </div>
    </main>
  );
}
