import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { createElement } from "react";

export type AppRoute = "/" | "/overview" | "/privacy" | "/login" | "/register" | "/forgot-password" | "/reset-password" | "/verify-email" | "/dashboard" | "/student" | "/admin" | "/admin/audit" | "/settings" | "/alerts" | "/disputes" | "/join";

/** Drops a trailing slash. Unknown paths pass through so App can render "Page not found". */
export function resolvePathname(rawPath: string): string {
  return rawPath.length > 1 ? rawPath.replace(/\/+$/, "") || "/" : rawPath;
}

interface RouterContextValue {
  pathname: string;
  navigate: (to: string) => void;
}

const RouterContext = createContext<RouterContextValue | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [pathname, setPathname] = useState<string>(() =>
    resolvePathname(window.location.pathname)
  );

  useEffect(() => {
    function onPop() {
      setPathname(resolvePathname(window.location.pathname));
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    // { intentional: true } lets LandingPage distinguish in-app navigation
    // from a fresh page load — so it doesn't auto-redirect on logo/back clicks.
    history.pushState({ intentional: true }, "", to);
    setPathname(to.split("?")[0]);
    window.scrollTo(0, 0);
  }, []);

  return createElement(RouterContext.Provider, { value: { pathname, navigate } }, children);
}

export function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error("useRouter must be used inside <RouterProvider>");
  return ctx;
}
