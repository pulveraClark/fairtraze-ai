import { Modal } from "./ui/Modal";
import { VerifyReportBox } from "./VerifyReportBox";

/**
 * Sidebar "Verify report" as a dialog. The box is mounted only while open, so closing it
 * clears the typed code and any result.
 */
export function VerifyReportDialog({
  open, onClose, restoreFocusTo,
}: { open: boolean; onClose: () => void; restoreFocusTo?: HTMLElement | null }) {
  return (
    <Modal open={open} onClose={onClose} title="Verify report" size="md" restoreFocusTo={restoreFocusTo}>
      <VerifyReportBox />
    </Modal>
  );
}
