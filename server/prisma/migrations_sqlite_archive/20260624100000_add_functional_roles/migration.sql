-- AddColumn: functionalRoles on GroupMembership
-- Default ["DEVELOPER"]: all existing groups use GitHub-only analysis; Developer is the
-- appropriate starting role. Leaders and instructors can reassign. Roles are context-only
-- and never affect contribution scores, flags, Gini, or team health.

ALTER TABLE "GroupMembership" ADD COLUMN "functionalRoles" TEXT NOT NULL DEFAULT '["DEVELOPER"]';
