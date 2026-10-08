import { useRef, useState } from "react";
import { Avatar, clearAvatarCache } from "./Avatar";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL } from "../lib/apiBase";
import { isAcceptedAvatarSource, prepareAvatar } from "../lib/avatarImage";

interface Props {
  userId: number;
  name: string;
  avatarUpdatedAt: string | null;
  onChanged: (avatarUpdatedAt: string | null) => void;
}

const BTN = "inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:border-indigo-400 hover:text-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50";

/** Settings > Profile: upload, change or remove the optional profile photo. */
export function ProfilePhotoControls({ userId, name, avatarUpdatedAt, onChanged }: Props) {
  const { token, refreshUser } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: "PUT" | "DELETE", body?: Blob) {
    const res = await fetch(`${API_BASE_URL}/api/users/me/avatar`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": body.type } : {}) },
      body,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; avatarUpdatedAt?: string | null };
    if (!res.ok) throw new Error(data.error ?? "Could not update your photo.");
    clearAvatarCache();
    onChanged(data.avatarUpdatedAt ?? null);
    await refreshUser();
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    const problem = isAcceptedAvatarSource(file);
    if (problem) { setError(problem); return; }
    setBusy(true);
    try {
      await send("PUT", await prepareAvatar(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update your photo.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    setError(null);
    setBusy(true);
    try {
      await send("DELETE");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove your photo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-4">
      <Avatar
        userId={userId}
        name={name}
        avatarUpdatedAt={avatarUpdatedAt}
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-indigo-200 bg-indigo-100 text-base font-bold text-indigo-900"
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">Profile photo (optional)</p>
        <p className="text-xs text-slate-600">Cropped to a square and resized to 256 × 256. Location data in the original is removed.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Choose a profile photo"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          <button type="button" className={BTN} disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? "Saving…" : avatarUpdatedAt ? "Change photo" : "Upload photo"}
          </button>
          {avatarUpdatedAt && (
            <button type="button" className={BTN} disabled={busy} onClick={() => void handleRemove()}>
              Remove photo
            </button>
          )}
        </div>
        {error && <p role="alert" className="mt-2 text-xs font-medium text-red-700">{error}</p>}
      </div>
    </div>
  );
}
