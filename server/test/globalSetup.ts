import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.test") });

// Runs once before the whole server test suite: applies any pending Prisma
// migrations to the dedicated Neon test branch so the schema never drifts
// from what the tests assume.
export async function setup(): Promise<void> {
  const dbUrl = process.env.TEST_DATABASE_URL;
  if (!dbUrl) {
    console.warn(
      "[test] TEST_DATABASE_URL is not set — copy server/.env.test.example to " +
        "server/.env.test and fill in the Neon test-branch connection string. " +
        "Tests that touch the database will fail until then."
    );
    return;
  }

  // Explicitly set DIRECT_DATABASE_URL too (schema.prisma's datasource requires it) -
  // without this, Prisma CLI's own .env auto-load would silently fill it in from
  // server/.env (the dev database), which is not the test branch this is meant to run against.
  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: dbUrl, DIRECT_DATABASE_URL: dbUrl },
    stdio: "inherit",
  });
}
