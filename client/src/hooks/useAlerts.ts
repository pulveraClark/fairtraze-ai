import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";

export interface AlertItem {
  id: number;
  projectId: number;
  type: "HIGH_RISK" | "MODERATE_RISK" | "MEMBER_FLAGGED" | "DISPUTE_FILED";
  message: string;
  teamHealth: string;
  read: boolean;
  createdAt: string;
  project: {
    id: number;
    groupName: string;
    assignmentLabel: string;
    name: string;
  };
}

export interface UseAlertsReturn {
  alerts: AlertItem[];
  unreadCount: number;
  loading: boolean;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => void;
}

export const ALERT_TYPE_META: Record<
  AlertItem["type"],
  { label: string; color: string; navigateTo: "project" | "disputes" }
> = {
  HIGH_RISK:      { label: "High Risk",       color: "text-red-400 bg-red-500/10 border-red-500/30",       navigateTo: "project" },
  MODERATE_RISK:  { label: "Moderate Risk",   color: "text-amber-400 bg-amber-500/10 border-amber-500/30", navigateTo: "project" },
  MEMBER_FLAGGED: { label: "Members Flagged", color: "text-orange-400 bg-orange-500/10 border-orange-500/30", navigateTo: "project" },
  DISPUTE_FILED:  { label: "Dispute",         color: "text-violet-400 bg-violet-500/10 border-violet-500/30", navigateTo: "disputes" },
};

export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function useAlerts(): UseAlertsReturn {
  const { token, user } = useAuth();
  const [alerts, setAlerts]       = useState<AlertItem[]>([]);
  const [unreadCount, setUnread]  = useState(0);
  const [loading, setLoading]     = useState(false);

  const load = useCallback(() => {
    if (!token || user?.systemRole !== "INSTRUCTOR") return;
    setLoading(true);
    fetch("/api/alerts", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: { alerts: AlertItem[]; unreadCount: number }) => {
        setAlerts(data.alerts ?? []);
        setUnread(data.unreadCount ?? 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token, user?.systemRole]);

  // Initial load + 60 s poll
  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const markRead = useCallback(
    async (id: number) => {
      if (!token) return;
      await fetch(`/api/alerts/${id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, read: true } : a)));
      setUnread((prev) => Math.max(0, prev - 1));
    },
    [token]
  );

  const markAllRead = useCallback(async () => {
    if (!token) return;
    await fetch("/api/alerts/read-all", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    setUnread(0);
  }, [token]);

  return { alerts, unreadCount, loading, markRead, markAllRead, refresh: load };
}
