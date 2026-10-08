import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";

export type AlertType =
  | "HIGH_RISK"
  | "MODERATE_RISK"
  | "MEMBER_FLAGGED"
  | "DISPUTE_FILED"
  | "JOIN_REQUEST_RECEIVED"
  | "JOIN_REQUEST_ACCEPTED"
  | "JOIN_REQUEST_DECLINED"
  | "TASK_ASSIGNED"
  | "DISPUTE_RESPONDED"
  | "ACCOUNT_LOCKED"
  | "COMMENT_REPLY"
  | "REPORT_READY"
  | "LEADER_CHANGED"
  | "MEMBER_REMOVED"
  | "ROLE_SUGGESTION_RECEIVED"
  | "ROLE_SUGGESTION_RESOLVED"
  | "GROUP_CREATED"
  | "DEPARTMENT_CREATED"
  | "USER_REGISTERED";

export interface AlertItem {
  id: number;
  projectId: number | null;
  type: AlertType;
  message: string;
  teamHealth: string | null;
  /** In-app path that is correct for this notification's recipient. */
  link: string | null;
  read: boolean;
  createdAt: string;
  project: {
    id: number;
    groupName: string;
    assignmentLabel: string;
    name: string;
  } | null;
}

export interface UseAlertsReturn {
  alerts: AlertItem[];
  unreadCount: number;
  loading: boolean;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => void;
}

interface AlertTypeMeta {
  label: string;
  /** Dark (bell dropdown) styling. */
  color: string;
  /** Light (full page) styling. */
  light: string;
}

export const ALERT_TYPE_META: Record<AlertType, AlertTypeMeta> = {
  HIGH_RISK:             { label: "High Risk",       color: "text-red-400 bg-red-500/10 border-red-500/30",          light: "text-red-700 bg-red-50 border-red-200" },
  MODERATE_RISK:         { label: "Moderate Risk",   color: "text-amber-400 bg-amber-500/10 border-amber-500/30",    light: "text-amber-700 bg-amber-50 border-amber-200" },
  MEMBER_FLAGGED:        { label: "Members Flagged", color: "text-orange-400 bg-orange-500/10 border-orange-500/30", light: "text-orange-700 bg-orange-50 border-orange-200" },
  DISPUTE_FILED:         { label: "Dispute",         color: "text-violet-400 bg-violet-500/10 border-violet-500/30", light: "text-violet-700 bg-violet-50 border-violet-200" },
  JOIN_REQUEST_RECEIVED: { label: "Join Request",    color: "text-sky-400 bg-sky-500/10 border-sky-500/30",          light: "text-sky-700 bg-sky-50 border-sky-200" },
  JOIN_REQUEST_ACCEPTED: { label: "Request Accepted", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", light: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  JOIN_REQUEST_DECLINED: { label: "Request Declined", color: "text-slate-300 bg-slate-500/10 border-slate-500/30",    light: "text-slate-700 bg-slate-100 border-slate-200" },
  TASK_ASSIGNED:         { label: "Task",            color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30", light: "text-indigo-700 bg-indigo-50 border-indigo-200" },
  DISPUTE_RESPONDED:     { label: "Review Response", color: "text-violet-400 bg-violet-500/10 border-violet-500/30", light: "text-violet-700 bg-violet-50 border-violet-200" },
  ACCOUNT_LOCKED:        { label: "Account Locked",  color: "text-red-400 bg-red-500/10 border-red-500/30",          light: "text-red-700 bg-red-50 border-red-200" },
  COMMENT_REPLY:           { label: "Comment Reply", color: "text-sky-400 bg-sky-500/10 border-sky-500/30", light: "text-sky-700 bg-sky-50 border-sky-200" },
  REPORT_READY:            { label: "Report Ready", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", light: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  LEADER_CHANGED:          { label: "Leader Change", color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30", light: "text-indigo-700 bg-indigo-50 border-indigo-200" },
  MEMBER_REMOVED:          { label: "Member Removed", color: "text-slate-300 bg-slate-500/10 border-slate-500/30", light: "text-slate-700 bg-slate-100 border-slate-200" },
  ROLE_SUGGESTION_RECEIVED:{ label: "Role Suggestion", color: "text-sky-400 bg-sky-500/10 border-sky-500/30", light: "text-sky-700 bg-sky-50 border-sky-200" },
  ROLE_SUGGESTION_RESOLVED:{ label: "Role Response", color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30", light: "text-indigo-700 bg-indigo-50 border-indigo-200" },
  GROUP_CREATED:           { label: "New Group", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", light: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  DEPARTMENT_CREATED:      { label: "New Department", color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30", light: "text-indigo-700 bg-indigo-50 border-indigo-200" },
  USER_REGISTERED:         { label: "New Instructor", color: "text-amber-400 bg-amber-500/10 border-amber-500/30", light: "text-amber-700 bg-amber-50 border-amber-200" },
};

const FALLBACK_META: AlertTypeMeta = {
  label: "Notification",
  color: "text-slate-300 bg-slate-500/10 border-slate-500/30",
  light: "text-slate-700 bg-slate-100 border-slate-200",
};

/** Safe lookup — an unknown type (e.g. a newer server) never crashes the UI. */
export function alertMeta(type: string): AlertTypeMeta {
  return (ALERT_TYPE_META as Record<string, AlertTypeMeta>)[type] ?? FALLBACK_META;
}

/**
 * Where clicking a notification should go. The server stores a role-correct
 * `link`; the fallback only covers rows that somehow lack one.
 */
export function alertLink(alert: Pick<AlertItem, "type" | "link" | "projectId">): string | null {
  if (alert.link) return alert.link;
  if (alert.type === "DISPUTE_FILED") return "/disputes";
  return alert.projectId ? `/project/${alert.projectId}` : null;
}

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
  const { token } = useAuth();
  const [alerts, setAlerts]       = useState<AlertItem[]>([]);
  const [unreadCount, setUnread]  = useState(0);
  const [loading, setLoading]     = useState(false);

  const load = useCallback(() => {
    if (!token) return;
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
  }, [token]);

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
