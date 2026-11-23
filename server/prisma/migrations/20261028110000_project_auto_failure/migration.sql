-- The last automatic analysis of a group that did not finish (nightly or on report open): when it happened and a
-- short code. Nullable, display only ("The latest update didn't finish; it will try again tonight."). Cleared by
-- the next analysis that saves a report. Read by no scoring code.
ALTER TABLE "Project" ADD COLUMN "lastAutoFailureAt" TIMESTAMP(3),
ADD COLUMN "lastAutoFailureCode" TEXT;
