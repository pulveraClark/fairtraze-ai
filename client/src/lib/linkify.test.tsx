import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Linkified, splitLinks } from "./linkify";
import { allowedBlobType } from "./briefAttachments";
import { briefImageSize } from "./briefImage";

describe("splitLinks / Linkified", () => {
  it("links http(s) URLs and leaves trailing punctuation outside", () => {
    const segs = splitLinks("See https://example.com/a?b=1, then http://x.org.");
    expect(segs.filter((s) => s.href).map((s) => s.href)).toEqual(["https://example.com/a?b=1", "http://x.org"]);
    expect(segs.map((s) => s.text).join("")).toBe("See https://example.com/a?b=1, then http://x.org.");
  });

  it("never turns text into HTML and ignores javascript: URLs", () => {
    const { container } = render(
      <p><Linkified text={'<img src=x onerror=alert(1)> <script>boom()</script> javascript:alert(1) https://ok.dev'} /></p>
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<script>boom()</script>");
    const anchors = container.querySelectorAll("a");
    expect(anchors).toHaveLength(1);
    expect(anchors[0].getAttribute("href")).toBe("https://ok.dev");
    expect(anchors[0].getAttribute("rel")).toContain("noopener");
  });
});

describe("attachment helpers", () => {
  it("picks a fixed Blob type, rejecting anything outside the allow-list", () => {
    expect(allowedBlobType({ kind: "PDF", mime: "text/html" })).toBe("application/pdf");
    expect(allowedBlobType({ kind: "IMAGE", mime: "image/webp" })).toBe("image/webp");
    expect(allowedBlobType({ kind: "IMAGE", mime: "image/svg+xml" })).toBeNull();
    expect(allowedBlobType({ kind: "IMAGE", mime: "text/html" })).toBeNull();
  });

  it("downscales to 1600px wide without upscaling", () => {
    expect(briefImageSize(3200, 1600)).toEqual({ width: 1600, height: 800 });
    expect(briefImageSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
