import { useCallback, useState } from "react";
import type { BoardTask } from "@shared/taskTypes";
import type { DocHeadingFocus } from "../components/tasks/details/LinkedHeadingNotice";

/**
 * State for "open the Document tab at a task's linked heading". The editor scrolls to the heading once
 * the document has synced and reports whether it found it; a missing heading keeps the document at the
 * top and lets the page show a notice. Pure UI state: it reads the document, it never writes to it.
 */
export function useDocHeadingFocus(goToDocument: () => void) {
  const [focus, setFocus] = useState<DocHeadingFocus | null>(null);

  const openAt = useCallback((task: BoardTask) => {
    setFocus(task.docHeading ? { taskId: task.id, taskKey: task.key, heading: task.docHeading, missing: false } : null);
    goToDocument();
  }, [goToDocument]);

  const onResolved = useCallback((found: boolean) => {
    setFocus((f) => (f ? (found ? null : { ...f, missing: true }) : f));
  }, []);

  const onRelink = useCallback((heading: string | null) => {
    setFocus((f) => (f && heading ? { ...f, heading, missing: false } : null));
  }, []);

  const clear = useCallback(() => setFocus(null), []);

  return { focus, openAt, onResolved, onRelink, clear };
}
