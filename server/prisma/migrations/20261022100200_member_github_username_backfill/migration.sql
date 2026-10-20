-- One-time data sync: Member.githubUsername was written once when a student created or joined a group, and is
-- empty for anyone who had not set a username then. User.githubUsername is the source of truth, so fill the empty
-- rows from the user's current username. A row is matched to its user by group membership plus display name
-- (Member has no user id); a name shared by two members of one group is left alone. Only empty values are
-- touched, so nothing already set is overwritten, and re-running changes nothing.
UPDATE "Member" m
SET "githubUsername" = u."githubUsername"
FROM "GroupMembership" gm
JOIN "User" u ON u."id" = gm."userId"
WHERE m."projectId" = gm."projectId"
  AND m."githubUsername" = ''
  AND m."studentName" = u."name"
  AND u."githubUsername" IS NOT NULL
  AND u."githubUsername" <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "GroupMembership" gm2
    JOIN "User" u2 ON u2."id" = gm2."userId"
    WHERE gm2."projectId" = gm."projectId" AND gm2."userId" <> gm."userId" AND u2."name" = u."name"
  );
