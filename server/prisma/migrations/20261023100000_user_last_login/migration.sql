-- Last successful sign-in / session refresh, shown to admins as "last active". Nullable: existing accounts
-- stay NULL ("Never") until their next sign-in. Additive only; nothing reads it for scoring.
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
