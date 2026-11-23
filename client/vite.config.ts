import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared/src"),
    },
  },
  // The PDF writer runs in a module Web Worker (src/lib/pdf/pdfWorker.ts).
  worker: { format: "es" },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/collab-authorship": {
        target: "ws://localhost:3001",
        ws: true,
      },
      "/collab": {
        target: "ws://localhost:3001",
        ws: true,
      },
    },
  },
});
