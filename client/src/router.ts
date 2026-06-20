import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { createElement } from "react";

export type AppRoute = "/" | "/demo" | "/overview" | "/login" | "/register";

const VALID_ROUTES: AppRoute[] = ["/", "/demo", "/overview", "/login", "/register"];

interface RouterContextValue {
  pathname: AppRoute;
  navigate: (to: AppRoute) => void;
}

const RouterContext = createContext<RouterContextValue | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [pathname, setPathname] = useState<AppRoute>(() => {
    const p = window.location.pathname;
    return VALID_ROUTES.includes(p as AppRoute) ? (p as AppRoute) : "/";
  });

  useEffect(() => {
    function onPop() {
      const p = window.location.pathname;
      setPathname(VALID_ROUTES.includes(p as AppRoute) ? (p as AppRoute) : "/");
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to: AppRoute) => {
    history.pushState(null, "", to);
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
