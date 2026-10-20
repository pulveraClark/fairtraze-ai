import { describe, it, expect } from "vitest";
import { checkRepoUrl, sameRepo } from "./repoUrl";

describe("checkRepoUrl", () => {
  it.each([
    ["https://github.com/acme/app", "https://github.com/acme/app"],
    ["  github.com/acme/app/  ", "https://github.com/acme/app"],
    ["http://www.github.com/acme/app.git", "https://github.com/acme/app"],
    ["https://github.com/acme/app?tab=readme", "https://github.com/acme/app"],
  ])("accepts %s", (input, url) => {
    const r = checkRepoUrl(input);
    expect(r.ok && r.url).toBe(url);
  });

  it.each([
    ["", /Paste the link/],
    ["https://gitlab.com/acme/app", /not a GitHub link/],
    ["acme/app", /not a GitHub link/],
    ["https://github.com/acme", /Add the repository name/],
    ["https://github.com/", /Add the repository name/],
    ["https://github.com/acme/app/tree/main", /Remove everything after/],
    ["https://github.com/ac me/app", /letters, numbers/],
  ])("rejects %j with a message that says what to do", (input, message) => {
    const r = checkRepoUrl(input);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(message);
  });
});

describe("sameRepo", () => {
  it("ignores case, .git and trailing slash", () => {
    expect(sameRepo("https://github.com/Acme/App", "https://github.com/acme/app.git/")).toBe(true);
    expect(sameRepo("https://github.com/acme/a", "https://github.com/acme/b")).toBe(false);
    expect(sameRepo(null, "https://github.com/acme/a")).toBe(false);
  });
});
