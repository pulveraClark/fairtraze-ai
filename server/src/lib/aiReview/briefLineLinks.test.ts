import { describe, it, expect } from "vitest";
import { lineBreaksKept, locateFileQuote, verifyRequirements, type RawFileInfo } from "./briefEvidence.js";
import { blobUrl, linkFileAtCommit } from "./evidenceLinks.js";
import { redactSecrets } from "./redact.js";
import { buildPseudonymEntries, scrubFreeText } from "../geminiPseudonyms.js";

const SHA = "a".repeat(40);
const repo = { owner: "o", repo: "r" };

const info = (raw: string, cleaned: string): RawFileInfo => ({ raw, aligned: lineBreaksKept(raw, cleaned) });

describe("locateFileQuote", () => {
  const text = ["import tkinter as tk", "", "def route(a, b):", "    return graphhopper.route(a, b)", "", "root = tk.Tk()"].join("\n");

  it("gives the first and last line and the real text", () => {
    const spot = locateFileQuote(text, "return graphhopper.route(a, b)", info(text, text))!;
    expect(spot.lines).toEqual([4, 4]);
    expect(spot.shown).toBe("return graphhopper.route(a, b)");
  });

  it("a quote across lines covers each line; case and spacing do not matter", () => {
    const spot = locateFileQuote(text, "DEF route(a, b):  return GRAPHHOPPER", info(text, text))!;
    expect(spot.lines).toEqual([3, 4]);
    expect(spot.shown).toBe("def route(a, b):\n    return graphhopper");
  });

  it("the first line is line 1", () => {
    expect(locateFileQuote(text, "import tkinter as tk", info(text, text))!.lines).toEqual([1, 1]);
  });

  it("no anchor when a multi-line secret was removed (line numbers would shift)", () => {
    const raw = ["a = 1", "-----BEGIN PRIVATE KEY-----", "MIIEvQIBADANBgkq", "abc", "-----END PRIVATE KEY-----", "def go():", "    run()"].join("\n");
    const cleaned = redactSecrets(raw);
    expect(cleaned).not.toContain("MIIEvQ");
    expect(lineBreaksKept(raw, cleaned)).toBe(false);
    expect(locateFileQuote(cleaned, "def go():", info(raw, cleaned))).toBeNull();
  });

  it("keeps the anchor but hides the quote when its own line was changed by redaction", () => {
    const raw = ["x = 1", "contact = 'ana@school.edu'", "go()"].join("\n");
    const cleaned = redactSecrets(raw);
    expect(cleaned).toContain("[email removed]");
    const spot = locateFileQuote(cleaned, "contact = '[email removed]'", info(raw, cleaned))!;
    expect(spot.lines).toEqual([2, 2]);
    expect(spot.shown).toBeUndefined();
  });

  it("keeps the anchor but hides the quote when a pseudonym replaced a name on that line", () => {
    const raw = ["# by Ana Cruz", "def go():", "    run()"].join("\n");
    const entries = buildPseudonymEntries([{ studentName: "Ana Cruz", githubUsername: "anacruz" }] as never);
    const cleaned = scrubFreeText(raw, entries);
    expect(cleaned).not.toBe(raw);
    const spot = locateFileQuote(cleaned, cleaned.split("\n")[0]!.replace(/^# /, ""), info(raw, cleaned))!;
    expect(spot.lines).toEqual([1, 1]);
    expect(spot.shown).toBeUndefined();
  });

  it("a shortened excerpt that ends mid-line still anchors the lines before the cut", () => {
    const raw = "one\ntwo\nthree is long";
    const cut = "one\ntwo\nthree";
    const spot = locateFileQuote(cut, "three", info(raw, cut))!;
    expect(spot.lines).toEqual([3, 3]);
    expect(spot.shown).toBe("three");
  });

  it("unknown file info or a quote that is not there gives nothing", () => {
    expect(locateFileQuote(text, "def route", undefined)).toBeNull();
    expect(locateFileQuote(text, "not in the file", info(text, text))).toBeNull();
  });
});

describe("verifyRequirements: code proof links", () => {
  const text = ["import tkinter as tk", "def route(a, b):", "    return graphhopper.route(a, b)", "root = tk.Tk()"].join("\n");
  const ctx = (extra: object = {}) => ({
    source: { instructions: "Build a route planner that uses GraphHopper. The route planner must have a Tkinter GUI.", files: [] },
    paths: new Set(["Graphhopper.py"]),
    fileText: new Map([["Graphhopper.py", text]]),
    docs: [], pieces: [], spans: [],
    headSha: SHA,
    rawFiles: new Map([["Graphhopper.py", info(text, text)]]),
    ...extra,
  });
  const req = (quote: string, sourceQuote: string) => ({
    text: "R", status: "FOUND" as const, sourceQuote,
    evidence: [{ type: "file" as const, ref: "Graphhopper.py", quote }],
  });

  it("two requirements on one file get different line ranges", () => {
    const v = verifyRequirements(
      [req("return graphhopper.route(a, b)", "Build a route planner that uses GraphHopper."), req("root = tk.Tk()", "The route planner must have a Tkinter GUI.")],
      ctx(),
    );
    expect(v.requirements[0]!.evidence[0]).toMatchObject({ headSha: SHA, lines: [3, 3], quoteSafe: true });
    expect(v.requirements[1]!.evidence[0]).toMatchObject({ headSha: SHA, lines: [4, 4], quoteSafe: true });
  });

  it("without a pinned commit nothing new is stored and acceptance is unchanged", () => {
    const v = verifyRequirements([req("root = tk.Tk()", "The route planner must have a Tkinter GUI.")], ctx({ headSha: undefined, rawFiles: undefined }));
    expect(v.requirements[0]!.status).toBe("FOUND");
    expect(v.requirements[0]!.evidence[0]).toEqual({ type: "file", ref: "Graphhopper.py", quote: "root = tk.Tk()" });
  });

  it("a quote that is not in the file is still rejected", () => {
    const v = verifyRequirements([req("nothing like this", "The route planner must have a Tkinter GUI.")], ctx());
    expect(v.requirements[0]).toMatchObject({ status: "NOT_FOUND", unverified: true });
  });
});

describe("code links", () => {
  it("blobUrl pins the commit and anchors one line or a range", () => {
    expect(blobUrl(repo, SHA, "src/My File.py", [12, 15])).toBe(`https://github.com/o/r/blob/${SHA}/src/My%20File.py#L12-L15`);
    expect(blobUrl(repo, SHA, "a.py", [7, 7])).toBe(`https://github.com/o/r/blob/${SHA}/a.py#L7`);
    expect(blobUrl(repo, SHA, "a.py")).toBe(`https://github.com/o/r/blob/${SHA}/a.py`);
  });

  it("linkFileAtCommit needs a pinned commit; without lines it links the file without #L", () => {
    expect(linkFileAtCommit(repo, "a.py", undefined, [1, 2])).toBeNull();
    expect(linkFileAtCommit(null, "a.py", SHA)).toBeNull();
    expect(linkFileAtCommit(repo, "a.py", SHA)).toEqual({ href: `https://github.com/o/r/blob/${SHA}/a.py`, isCommit: false });
    expect(linkFileAtCommit(repo, "a.py", SHA, [3, 4])).toEqual({ href: `https://github.com/o/r/blob/${SHA}/a.py#L3-L4`, isCommit: false, lines: [3, 4] });
    expect(linkFileAtCommit(repo, "a.py", SHA, [0, 4])!.href).not.toContain("#L");
  });
});
