import { describe, it, expect } from "vitest";
import { analysisErrorText, analysisBodyText, NETWORK_ERROR_TEXT } from "./failureText";
import { AnalyzeError } from "./analyzeStream";
import { ANALYSIS_FAILURE_TEXT } from "@shared/failureMessages";

describe("failure wording", () => {
  it("words each analysis failure by its code, with what to do next and no blame", () => {
    for (const [code, text] of Object.entries(ANALYSIS_FAILURE_TEXT)) {
      expect(analysisErrorText(new AnalyzeError("raw server text", 500, code))).toBe(text);
    }
    expect(ANALYSIS_FAILURE_TEXT.GITHUB_RATE_LIMITED).toBe(
      "GitHub is limiting requests right now. Wait about an hour, then select Re-analyze. The nightly update will also try again.");
    expect(ANALYSIS_FAILURE_TEXT.GITHUB_REPO_UNREADABLE).toBe(
      "We couldn't read the repository. Check that the link is correct and the repository is public, then select Re-analyze.");
    expect(ANALYSIS_FAILURE_TEXT.GITHUB_NOT_CONFIGURED).toBe("GitHub access isn't set up on this server. Contact the FairTraze team.");
    expect(ANALYSIS_FAILURE_TEXT.GITHUB_UNREACHABLE).toBe("We couldn't reach GitHub. Try again in a few minutes.");
    expect(ANALYSIS_FAILURE_TEXT.ANALYSIS_FAILED).toBe("The analysis didn't finish. Try again in a few minutes. If it keeps happening, contact the FairTraze team.");
    for (const text of Object.values(ANALYSIS_FAILURE_TEXT)) expect(text).not.toMatch(/student|member|you did|your fault|token|GITHUB_/i);
  });

  it("uses the server's own sentence when there is no known code (an older server, a validation error)", () => {
    expect(analysisErrorText(new AnalyzeError("Project 9 not found", 404))).toBe("Project 9 not found");
    expect(analysisBodyText({ error: "Link a GitHub repository first." })).toBe("Link a GitHub repository first.");
  });

  it("falls back to the generic sentence when there is nothing at all, and words a lost connection plainly", () => {
    expect(analysisBodyText(null)).toBe(ANALYSIS_FAILURE_TEXT.ANALYSIS_FAILED);
    expect(analysisBodyText({ code: "GITHUB_RATE_LIMITED" })).toBe(ANALYSIS_FAILURE_TEXT.GITHUB_RATE_LIMITED);
    expect(analysisErrorText(new TypeError("Failed to fetch"))).toBe(NETWORK_ERROR_TEXT);
    expect(NETWORK_ERROR_TEXT).toBe("We couldn't reach the server. Check your connection, then try again.");
  });
});
