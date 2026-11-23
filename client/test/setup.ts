import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom has no layout: ProseMirror measures ranges when it scrolls the selection into view.
if (typeof Range !== "undefined") {
  Range.prototype.getClientRects ??= () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect ??= () => new DOMRect(0, 0, 0, 0);
}

afterEach(() => {
  // Some files opt into the node environment (no DOM, no storage).
  if (typeof document !== "undefined") cleanup();
  if (typeof localStorage !== "undefined") localStorage.clear();
});
