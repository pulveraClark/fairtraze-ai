import { classFullLabel } from "../lib/classLabel";
import type { ClassCodes } from "../lib/classLabel";

/**
 * "UXA-101 · EDP 12345" for cards and page headers. Its text is exactly classFullLabel(); the EDP part
 * is a separate span only so a screen can style it quieter (edpClassName).
 */
export function ClassCodeLabel({ subjectCode, edpCode, className, edpClassName }: ClassCodes & { className?: string; edpClassName?: string }) {
  const full = classFullLabel({ subjectCode, edpCode });
  const subject = subjectCode?.trim() ?? "";
  const rest = subject ? full.slice(subject.length) : "";
  return (
    <span className={className}>
      {subject ? subject : full}
      {rest && <span className={edpClassName}>{rest}</span>}
    </span>
  );
}
