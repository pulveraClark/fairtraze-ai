import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  systemRole: "ADMIN" | "INSTRUCTOR" | "STUDENT";
  githubUsername?: string | null;
  emailVerified?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  register: (email: string, password: string, name: string, role?: string) => Promise<AuthUser & { emailVerificationRequired: boolean }>;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  refreshUser: () => Promise<AuthUser | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "ft_auth_token";

// Module-scoped so the fetch interceptor (installed once, outside React) can
// keep the live AuthProvider instance's state in sync without needing every
// call site to be React-aware.
let onTokenRefreshed: ((token: string) => void) | null = null;
let onSessionExpired: (() => void) | null = null;

// Concurrent 401s must not each call /api/auth/refresh independently — the
// refresh token rotates on every use, so a second concurrent call would find
// the first call's cookie already invalidated and incorrectly end the
// session. Share one in-flight request across all callers.
let inFlightRefresh: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        localStorage.removeItem(TOKEN_KEY);
        onSessionExpired?.();
        return null;
      }
      const data = (await res.json()) as { token: string };
      localStorage.setItem(TOKEN_KEY, data.token);
      onTokenRefreshed?.(data.token);
      return data.token;
    } catch {
      return null;
    }
  })();

  try {
    return await inFlightRefresh;
  } finally {
    inFlightRefresh = null;
  }
}

let fetchPatched = false;

function installFetchInterceptor() {
  if (fetchPatched) return;
  fetchPatched = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const isApiRequest = url.startsWith("/api/");
    const isAuthExempt =
      url.startsWith("/api/auth/login") ||
      url.startsWith("/api/auth/register") ||
      url.startsWith("/api/auth/refresh");

    const response = await originalFetch(input, init);

    if (!isApiRequest || isAuthExempt || response.status !== 401) {
      return response;
    }

    const newToken = await refreshAccessToken();
    if (!newToken) return response;

    const retryHeaders = new Headers(init?.headers);
    retryHeaders.set("Authorization", `Bearer ${newToken}`);
    return originalFetch(input, { ...init, headers: retryHeaders });
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [token, setToken]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Keep the module-level fetch interceptor in sync with this instance's state.
  useEffect(() => {
    installFetchInterceptor();
    onTokenRefreshed = (newToken) => setToken(newToken);
    onSessionExpired = () => {
      setToken(null);
      setUser(null);
    };
    return () => {
      onTokenRefreshed = null;
      onSessionExpired = null;
    };
  }, []);

  // Restore session from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setLoading(false);
      return;
    }
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${stored}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = (await res.json()) as AuthUser;
        setUser(data);
        setToken(stored);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => setLoading(false));
  }, []);

  function storeSession(newToken: string, newUser: AuthUser) {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  }

  async function register(email: string, password: string, name: string, role?: string): Promise<AuthUser & { emailVerificationRequired: boolean }> {
    const res = await fetch("/api/auth/register", {
      method:      "POST",
      headers:     { "Content-Type": "application/json" },
      credentials: "include",
      body:        JSON.stringify({ email, password, name, ...(role ? { role } : {}) }),
    });
    const data = (await res.json()) as { token?: string; user?: AuthUser; emailVerificationRequired?: boolean; error?: string };
    if (!res.ok) throw new Error(data.error ?? `Registration failed (${res.status})`);
    storeSession(data.token!, data.user!);
    return { ...data.user!, emailVerificationRequired: data.emailVerificationRequired ?? true };
  }

  async function login(email: string, password: string): Promise<AuthUser> {
    const res = await fetch("/api/auth/login", {
      method:      "POST",
      headers:     { "Content-Type": "application/json" },
      credentials: "include",
      body:        JSON.stringify({ email, password }),
    });
    const data = (await res.json()) as { token?: string; user?: AuthUser; error?: string };
    if (!res.ok) throw new Error(data.error ?? `Login failed (${res.status})`);
    storeSession(data.token!, data.user!);
    return data.user!;
  }

  async function refreshUser(): Promise<AuthUser | null> {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) return null;
    try {
      const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${stored}` } });
      if (res.ok) {
        const data = (await res.json()) as AuthUser;
        setUser(data);
        return data;
      }
    } catch {
      // network error — return null, stale value stays
    }
    return null;
  }

  function logout() {
    fetch("/api/auth/logout", {
      method:      "POST",
      credentials: "include",
    }).catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, register, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
