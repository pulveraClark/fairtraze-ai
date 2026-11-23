/**
 * Runs `run` every `ms` while the tab is visible, and once more when the window gets focus or the tab
 * becomes visible again. A hidden tab makes no request at all (a timer that fires while hidden does
 * nothing). Returns the cleanup. The caller makes its own first call.
 */
export function startVisiblePoll(run: () => void, ms: number): () => void {
  const timer = setInterval(() => {
    if (document.visibilityState === "visible") run();
  }, ms);
  const onFocus = () => run();
  const onVisibility = () => {
    if (document.visibilityState === "visible") run();
  };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    clearInterval(timer);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
