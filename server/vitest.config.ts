import { defineConfig } from "vitest/config";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Local dev: values come from server/.env.test (gitignored). In CI, that
// file doesn't exist — GitHub Actions injects TEST_DATABASE_URL/AUTH_SECRET/
// GEMINI_API_KEY directly into process.env instead, so process.env must win
// whenever it's already set.
const parsed = dotenv.config({ path: path.resolve(__dirname, ".env.test") }).parsed ?? {};
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? parsed.TEST_DATABASE_URL ?? parsed.DATABASE_URL ?? "";
const authSecret = process.env.AUTH_SECRET ?? parsed.AUTH_SECRET ?? "test-secret-do-not-use-in-prod";
const geminiApiKey = process.env.GEMINI_API_KEY ?? parsed.GEMINI_API_KEY ?? "test-gemini-key";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      ...parsed,
      // PrismaClient reads DATABASE_URL, not TEST_DATABASE_URL — point it at
      // the dedicated Neon test branch so tests never touch production data.
      DATABASE_URL: testDatabaseUrl,
      AUTH_SECRET: authSecret,
      GEMINI_API_KEY: geminiApiKey,
      NODE_ENV: "test",
    },
    setupFiles: ["./test/setupEnv.ts"],
    globalSetup: ["./test/globalSetup.ts"],
    testTimeout: 20000,
    hookTimeout: 30000,
    // Tests share one Neon test-branch connection; running files sequentially
    // avoids truncate/insert races between them.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared/src"),
    },
  },
});
