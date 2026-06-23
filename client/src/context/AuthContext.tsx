import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  systemRole: "ADMIN" | "INSTRUCTOR" | "STUDENT";
  githubUsername?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  register: (email: string, password: string, name: string, role?: string) => Promise<AuthUser>;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "ft_auth_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [token, setToken]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  async function register(email: string, password: string, name: string, role?: string): Promise<AuthUser> {
    const res = await fetch("/api/auth/register", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password, name, ...(role ? { role } : {}) }),
    });
    const data = (await res.json()) as { token?: string; user?: AuthUser; error?: string };
    if (!res.ok) throw new Error(data.error ?? `Registration failed (${res.status})`);
    storeSession(data.token!, data.user!);
    return data.user!;
  }

  async function login(email: string, password: string): Promise<AuthUser> {
    const res = await fetch("/api/auth/login", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password }),
    });
    const data = (await res.json()) as { token?: string; user?: AuthUser; error?: string };
    if (!res.ok) throw new Error(data.error ?? `Login failed (${res.status})`);
    storeSession(data.token!, data.user!);
    return data.user!;
  }

  async function refreshUser(): Promise<void> {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) return;
    try {
      const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${stored}` } });
      if (res.ok) {
        const data = (await res.json()) as AuthUser;
        setUser(data);
      }
    } catch {
      // ignore — stale name stays until next login
    }
  }

  function logout() {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      fetch("/api/auth/logout", {
        method:  "POST",
        headers: { Authorization: `Bearer ${stored}` },
      }).catch(() => {});
    }
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
