import { useEffect, type ReactNode } from "react";
import { useRouter } from "../router";
import { useEmailEnabled } from "../lib/useEmailEnabled";

/** Pages that only make sense when the server sends email (forgot/reset password, verify email). */
export function EmailOnlyRoute({ children }: { children: ReactNode }) {
  const enabled = useEmailEnabled();
  const { navigate } = useRouter();

  useEffect(() => {
    if (!enabled) navigate("/login");
  }, [enabled, navigate]);

  return enabled ? <>{children}</> : null;
}
