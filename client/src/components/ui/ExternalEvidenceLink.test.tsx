import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExternalEvidenceLink, FileEvidenceLink, fileLinkLabel } from "./ExternalEvidenceLink";

const href = "https://github.com/example/Trips/commit/a41f9c2d0e5b#diff-abc";

describe("ExternalEvidenceLink", () => {
  it("opens in a new tab safely, says so in its name, shows an icon and is a 40px target", () => {
    render(<FileEvidenceLink path="server/Graphhopper.py" href={href} isCommit />);
    const a = screen.getByRole("link", { name: "Open Graphhopper.py changes on GitHub (new tab)" });
    expect(a.getAttribute("href")).toBe(href);
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    expect(a.className).toContain("min-h-10");
    expect(a.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(a.textContent).toBe("server/Graphhopper.py");
  });

  it("names a file-only link as a file, and wraps long paths", () => {
    expect(fileLinkLabel("a/b/Trip.py", false)).toBe("Open Trip.py file on GitHub (new tab)");
    render(<ExternalEvidenceLink href={href} label="x">{"a/".repeat(60)}</ExternalEvidenceLink>);
    expect(screen.getByRole("link").innerHTML).toContain("[overflow-wrap:anywhere]");
  });

  it("lists the other commits as +N more, each its own new-tab link", () => {
    render(<FileEvidenceLink path="a.ts" href={href} isCommit more={[{ sha: "b52e0d3", href: "https://github.com/example/Trips/commit/b52e0d3" }, { sha: "c63f1e4", href: "https://github.com/example/Trips/commit/c63f1e4" }]} />);
    expect(screen.getByText("+2 more")).toBeTruthy();
    const b = screen.getByRole("link", { name: "Open commit b52e0d3 on GitHub (new tab)" });
    expect(b.getAttribute("target")).toBe("_blank");
    expect(b.getAttribute("rel")).toBe("noopener noreferrer");
    expect(b.className).toContain("min-h-10");
  });

  it("shows plain text, no link, for a review written before links existed", () => {
    render(<FileEvidenceLink path="src/Login.tsx" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("src/Login.tsx")).toBeTruthy();
  });
});
