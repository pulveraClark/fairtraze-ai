-- When the owning instructor first opened a student's note. Nullable: older notes were never marked.
-- Display only (the student's Sent / Seen / Answered status); read by no scoring code.
ALTER TABLE "Dispute" ADD COLUMN "seenAt" TIMESTAMP(3);
