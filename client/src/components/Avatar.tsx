import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useAuthOptional } from "../context/AuthContext";
import { API_BASE_URL } from "../lib/apiBase";
import { initials } from "../lib/memberView";

// Blob promises are shared per photo version so a list of rows fetches each photo once.
const blobCache = new Map<string, Promise<Blob>>();

export function clearAvatarCache(): void {
  blobCache.clear();
}

function loadAvatarBlob(userId: number, version: string, token: string): Promise<Blob> {
  const key = `${userId}:${version}`;
  let p = blobCache.get(key);
  if (!p) {
    p = fetch(`${API_BASE_URL}/api/users/${userId}/avatar?v=${encodeURIComponent(version)}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((res) => {
      if (!res.ok) throw new Error(`avatar ${res.status}`);
      return res.blob();
    });
    p.catch(() => blobCache.delete(key));
    blobCache.set(key, p);
  }
  return p;
}

interface Props {
  userId: number | null | undefined;
  name: string;
  /** ISO version of the user's photo; null/undefined means no photo (initials only). */
  avatarUpdatedAt?: string | null;
  /** Wrapper classes: size, shape and the initials-fallback colors (callers keep their existing styling). */
  className?: string;
  style?: CSSProperties;
}

/** Profile photo with initials fallback. Decorative: the name is always rendered beside it. */
export function Avatar({ userId, name, avatarUpdatedAt, className = "", style }: Props) {
  const token = useAuthOptional()?.token ?? null;
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !avatarUpdatedAt || !token) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    loadAvatarBlob(userId, avatarUpdatedAt, token)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => { if (!cancelled) setSrc(null); });
    return () => {
      cancelled = true;
      // Revoke on photo change or unmount so object URLs do not accumulate.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [userId, avatarUpdatedAt, token]);

  return (
    <span aria-hidden="true" className={`${className} select-none overflow-hidden`} style={style}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}
