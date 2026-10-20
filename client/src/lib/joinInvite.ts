// The one place that builds a class invite link and copies text. The QR codes and the "Copy invite link"
// button all use joinInviteUrl, so they can never disagree.

export function joinInviteUrl(code: string, origin: string = window.location.origin): string {
  return `${origin}/join?code=${encodeURIComponent(code.trim())}`;
}

/** Copies text; resolves false when the browser refuses so the caller can offer select-and-copy. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
