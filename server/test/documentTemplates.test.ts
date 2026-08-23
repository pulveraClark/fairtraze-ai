import { createRequire } from "module";
import type * as PMTypes from "prosemirror-model";
import { describe, it, expect } from "vitest";
import { Y } from "../src/collab/yjsCjs.js";
import { legacySchema } from "../src/collab/persistence.js";
import { DOCUMENT_TEMPLATES } from "@shared/documentTemplates.js";

const require = createRequire(import.meta.url);
const { prosemirrorJSONToYXmlFragment } = require("@tiptap/y-tiptap") as {
  prosemirrorJSONToYXmlFragment: (
    schema: PMTypes.Schema,
    json: Record<string, unknown>,
    fragment: InstanceType<typeof Y.XmlFragment>
  ) => void;
};

// Every template's ProseMirror JSON must parse cleanly under the exact schema
// persistence.ts's bindState() uses for the no-origin legacy-content migration path — the
// mechanism document templates rely on (documents.ts POST /document/init) to seed a fresh
// document's initial content invisibly to scoring. A node/mark type this schema doesn't support
// would throw here (and, unfixed, would throw for real the first time a leader opened a group's
// document after picking that template).
describe("DOCUMENT_TEMPLATES content validity", () => {
  it.each(DOCUMENT_TEMPLATES)("$name parses under legacySchema without throwing", (template) => {
    const ydoc = new Y.Doc();
    expect(() => {
      prosemirrorJSONToYXmlFragment(
        legacySchema,
        template.content as unknown as Record<string, unknown>,
        ydoc.getXmlFragment("default")
      );
    }).not.toThrow();
    ydoc.destroy();
  });

  it("has unique, non-empty ids", () => {
    const ids = DOCUMENT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.length).toBeGreaterThan(0);
  });
});
