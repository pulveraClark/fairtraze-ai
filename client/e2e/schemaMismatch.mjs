// Local-only: does a client whose schema lacks `pageBreak` delete the node from the shared Yjs
// document? Run via `npm run test:e2e -w client`. See e2e/pageParity.mjs for how the harness runs.
import { createServer } from "vite";
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5197;
const server = await createServer({ root: path.resolve(here, ".."), server: { port: PORT, strictPort: true }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch();
let exitCode = 0;
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`http://localhost:${PORT}/e2e/harness.html`);
  await page.waitForFunction(() => window.__harness);
  const r = await page.evaluate(() => window.__harness.schemaMismatch());
  console.log(JSON.stringify(r, null, 2));
  if (errors.length) console.log("browser errors:", errors.slice(0, 3));
  const deleted = r.pageBreaksInNewDoc === 0 || r.pageBreaksInOldDoc === 0;
  console.log(deleted ? "RESULT: the old client DELETED the page break from the shared document." : "RESULT: the page break survived the old client.");
  // Exit 0 either way: this is a measurement, not a pass/fail gate. The protection (version check)
  // is tested in the server and client suites.
} finally {
  await browser.close();
  await server.close();
}
process.exit(exitCode);
