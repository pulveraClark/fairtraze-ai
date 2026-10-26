// Asks the server to refresh a stale report in the background. The server alone decides whether
// anything runs (report older than an hour, project active, something changed, nothing running), so
// this sends no options. Any failure means "do nothing": the page keeps the report it has.
export async function requestReportRefresh(projectId: number, token: string | null): Promise<boolean> {
  try {
    const res = await fetch(`/api/groups/${projectId}/refresh-report`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { refreshing?: boolean };
    return data.refreshing === true;
  } catch {
    return false;
  }
}
