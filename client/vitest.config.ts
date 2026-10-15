import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./test/setup.ts"],
      globals: false,
      // Many files mount TipTap/React in jsdom. With one worker per core they starve each other and
      // the first test of a file can pass the 5s default under load (seen: random unrelated tests
      // timing out in full runs, all passing alone). Fewer workers + a roomier timeout make the
      // full run deterministic; single files are unaffected.
      maxWorkers: 4,
      testTimeout: 20_000,
      hookTimeout: 20_000,
    },
  })
);
