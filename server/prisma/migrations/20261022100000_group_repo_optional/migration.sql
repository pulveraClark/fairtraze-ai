-- A group can be created before it has a GitHub repository; the group then links one from its setup card.
-- NULL means "no repository linked". Earlier rows stored '' for Docs-only groups; normalise them so
-- there is one meaning.
ALTER TABLE "Project" ALTER COLUMN "repoUrl" DROP NOT NULL;
UPDATE "Project" SET "repoUrl" = NULL WHERE "repoUrl" = '';
