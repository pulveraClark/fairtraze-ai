import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { createElement } from "react";

export type AppRoute = "/" | "/overview" | "/login" | "/register" | "/dashboard" | "/student" | "/admin" | "/settings" | "/alerts";

const VALID_STATIC_ROUTES: AppRoute[] = ["/", "/overview", "/login", "/register", "/dashboard", "/student", "/admin", "/settings", "/alerts"];

function resolvePathname(raw: string): string {
  if ((VALID_STATIC_ROUTES as string[]).includes(raw)) return raw;
  if (/^\/project\/\d+$/.test(raw)) return raw;
  if (/^\/class\/\d+\/assignment\/\d+$/.test(raw)) return raw;
  if (/^\/class\/\d+$/.test(raw)) return raw;
  if (/^\/student\/class\/.+$/.test(raw)) return raw;
  if (/^\/student\/group\/\d+$/.test(raw)) return raw;
  return "/";
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
    setPathname(to);
    window.scrollTo(0, 0);
  }, []);

  return createElement(RouterContext.Provider, { value: { pathname, navigate } }, children);
}

export function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error("useRouter must be used inside <RouterProvider>");
  return ctx;
}
