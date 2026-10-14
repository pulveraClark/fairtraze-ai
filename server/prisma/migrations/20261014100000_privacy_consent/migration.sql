-- Privacy consent (RA 10173). Additive and nullable: existing users have no recorded consent
-- and are re-prompted on next login. deletedAt marks an anonymized (erased) account tombstone.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "consentVersion" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "consentAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
