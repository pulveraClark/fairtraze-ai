import { useEffect, useRef, useState } from "react";
import { copyText, joinInviteUrl } from "../lib/joinInvite";
import { useToast } from "./Toast";
import { BUTTON_SECONDARY_COMPACT } from "./ui/styles";

/** "Copy invite link" for a class code. If the browser refuses the clipboard, the link is shown selected to copy by hand. */
export function CopyInviteLinkButton({ code, className = "" }: { code: string; className?: string }) {
  const { showSuccessToast } = useToast();
  const [manual, setManual] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const url = joinInviteUrl(code);

  useEffect(() => {
    if (manual) inputRef.current?.select();
  }, [manual]);

  async function handleClick() {
    if (await copyText(url)) {
      setManual(false);
      showSuccessToast("Invite link copied");
    } else {
      setManual(true);
    }
  }

  return (
    <span className={`inline-flex flex-col gap-1 ${className}`}>
      <button type="button" onClick={() => void handleClick()} className={BUTTON_SECONDARY_COMPACT}>
        Copy invite link
      </button>
      {manual && (
        <label className="text-xs text-slate-800">
          Copy this link (Ctrl+C):
          <input
            ref={inputRef}
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-1 block w-full min-w-[14rem] rounded-lg border border-slate-400 bg-white px-2 py-1 font-mono text-xs text-slate-900"
          />
        </label>
      )}
    </span>
  );
}
