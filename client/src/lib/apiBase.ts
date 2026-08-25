// Absolute backend origin in production (e.g. "https://fairtraze-ai.onrender.com").
// Empty string in dev preserves today's relative "/api/..." paths, which
// vite.config.ts's dev-server proxy forwards to localhost:3001.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

export function wsBaseUrl(): string {
  if (API_BASE_URL) {
    return API_BASE_URL.replace(/^http/, "ws"); // https:// -> wss://, http:// -> ws://
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}`;
}
