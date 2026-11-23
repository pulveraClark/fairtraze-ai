import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TextAlign from "@tiptap/extension-text-align";
import * as Y from "yjs";
import { EditorShortcuts, formattingExtensions, starterKitOptions } from "./formattingExtensions";
import { SearchReplace, findMatches, getSearchState, replaceMatches } from "./searchReplace";
import { PageBreak } from "./pageBreak";

const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) editors.pop()!.destroy();
});

function makeEditor(content: string, extra: ConstructorParameters<typeof Editor>[0] = {}) {
  const ed = new Editor({
    element: document.createElement("div"),
    extensions: [
      StarterKit.configure(starterKitOptions),
      ...formattingExtensions,
      SearchReplace,
      Table,
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content,
    ...extra,
  });
  editors.push(ed);
  return ed;
}

function press(ed: Editor, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  ed.view.dom.dispatchEvent(event);
  return event;
}

const indentOfFirst = (ed: Editor) => (ed.getJSON().content?.[0]?.attrs?.indent as number | undefined) ?? 0;

describe("Tab / Shift+Tab indentation never traps keyboard focus (WCAG 2.1.2)", () => {
  it("Tab indents the paragraph and the key is consumed", () => {
    const ed = makeEditor("<p>hello</p>");
    ed.commands.setTextSelection(2);
    const e = press(ed, "Tab");
    expect(e.defaultPrevented).toBe(true);
    expect(indentOfFirst(ed)).toBe(1);
    press(ed, "Tab");
    expect(indentOfFirst(ed)).toBe(2);
  });

  it("Escape then Tab is left to the browser: focus can leave, nothing is indented", () => {
    const ed = makeEditor("<p>hello</p>");
    ed.commands.setTextSelection(2);
    press(ed, "Escape");
    const e = press(ed, "Tab");
    expect(e.defaultPrevented).toBe(false); // browser moves focus out of the editor
    expect(indentOfFirst(ed)).toBe(0);
    // One-shot: the next Tab (after focus came back) indents again.
    press(ed, "Tab");
    expect(indentOfFirst(ed)).toBe(1);
  });

  it("Escape then Shift+Tab also leaves, and a Shift key press alone does not disarm the escape", () => {
    const ed = makeEditor("<p>hello</p>");
    ed.commands.setTextSelection(2);
    ed.commands.indent();
    press(ed, "Escape");
    press(ed, "Shift", { shiftKey: true });
    const e = press(ed, "Tab", { shiftKey: true });
    expect(e.defaultPrevented).toBe(false);
    expect(indentOfFirst(ed)).toBe(1); // not outdented: the key went to the browser
  });

  it("any other key disarms the escape", () => {
    const ed = makeEditor("<p>hello</p>");
    ed.commands.setTextSelection(2);
    press(ed, "Escape");
    press(ed, "a");
    const e = press(ed, "Tab");
    expect(e.defaultPrevented).toBe(true);
    expect(indentOfFirst(ed)).toBe(1);
  });

  it("Shift+Tab with nothing to outdent is passed through so focus can move backwards", () => {
    const ed = makeEditor("<p>hello</p>");
    ed.commands.setTextSelection(2);
    const e = press(ed, "Tab", { shiftKey: true });
    expect(e.defaultPrevented).toBe(false);
    ed.commands.indent();
    const e2 = press(ed, "Tab", { shiftKey: true });
    expect(e2.defaultPrevented).toBe(true);
    expect(indentOfFirst(ed)).toBe(0);
  });

  it("Tab inside a table still moves between cells (the table extension owns it, not indent)", () => {
    const ed = makeEditor("<table><tr><td><p>one</p></td><td><p>two</p></td></tr></table>");
    ed.commands.setTextSelection(3); // inside the first cell
    const first = ed.state.selection.$from.node(-1).textContent;
    expect(first).toBe("one");
    press(ed, "Tab");
    expect(ed.state.selection.$from.node(-1).textContent).toBe("two");
    expect(JSON.stringify(ed.getJSON())).not.toContain('"indent":1');
  });

  it("Tab in a list sinks the item; Escape then Tab still leaves", () => {
    const ed = makeEditor("<ul><li><p>a</p></li><li><p>b</p></li></ul>");
    ed.commands.setTextSelection(ed.state.doc.content.size - 3); // inside "b"
    press(ed, "Tab");
    expect(ed.getHTML()).toMatch(/<li><p>a<\/p><ul><li><p>b<\/p>/);
    press(ed, "Escape");
    expect(press(ed, "Tab").defaultPrevented).toBe(false);
  });

  it("does nothing in a read-only editor", () => {
    const ed = makeEditor("<p>hello</p>", { editable: false });
    const e = press(ed, "Tab");
    expect(e.defaultPrevented).toBe(false);
    expect(indentOfFirst(ed)).toBe(0);
  });
});

describe("links: only http, https and mailto, opened safely", () => {
  it("renders safe links with target=_blank and rel=noopener noreferrer", () => {
    const ed = makeEditor('<p><a href="https://example.com/a">x</a> <a href="mailto:a@example.com">m</a></p>');
    const html = ed.getHTML();
    expect(html).toContain('href="https://example.com/a"');
    expect(html).toContain('href="mailto:a@example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("drops javascript: and data: links when content is parsed", () => {
    const ed = makeEditor(
      '<p><a href="javascript:alert(1)">a</a> <a href="data:text/html,x">b</a> <a href="JaVaScRiPt:alert(1)">c</a> <a href="vbscript:x">d</a></p>'
    );
    const html = ed.getHTML().toLowerCase();
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text");
    expect(html).not.toContain("vbscript:");
  });

  it("setLink refuses an unsafe href", () => {
    const ed = makeEditor("<p>hello world</p>");
    ed.commands.setTextSelection({ from: 1, to: 6 });
    expect(ed.commands.setLink({ href: "javascript:alert(1)" })).toBe(false);
    expect(ed.isActive("link")).toBe(false);
    expect(ed.commands.setLink({ href: "https://example.com" })).toBe(true);
    expect(ed.isActive("link")).toBe(true);
  });

  it("never renders a hostile href written straight into the shared Yjs document", () => {
    const ydoc = new Y.Doc();
    const ed = new Editor({
      element: document.createElement("div"),
      extensions: [StarterKit.configure({ ...starterKitOptions }), ...formattingExtensions, Collaboration.configure({ document: ydoc })],
    });
    editors.push(ed);
    // What a modified client could do: format a text run with an arbitrary link mark.
    ydoc.transact(() => {
      const p = new Y.XmlElement("paragraph");
      const t = new Y.XmlText();
      p.insert(0, [t]);
      ydoc.getXmlFragment("default").insert(0, [p]);
      t.insert(0, "click me", { link: { href: "javascript:alert(document.cookie)" } });
    });
    expect(ed.getHTML().toLowerCase()).not.toContain("javascript:");
    expect(ed.view.dom.innerHTML.toLowerCase()).not.toContain("javascript:");
  });
});

describe("find and replace", () => {
  it("finds matches per text block, with and without match case", () => {
    const ed = makeEditor("<p>Cat cat CAT</p><p>concat</p>");
    expect(findMatches(ed.state.doc, "cat", false)).toHaveLength(4);
    expect(findMatches(ed.state.doc, "cat", true)).toHaveLength(2); // "cat" and "concat"
    expect(findMatches(ed.state.doc, "", false)).toHaveLength(0);
    // Regex characters in the query are literal.
    const ed2 = makeEditor("<p>a.b a+b (a)</p>");
    expect(findMatches(ed2.state.doc, "a.b", false)).toHaveLength(1);
    expect(findMatches(ed2.state.doc, "(a)", false)).toHaveLength(1);
  });

  it("steps next/previous with wrap-around and tracks the count", () => {
    const ed = makeEditor("<p>x one x two x</p>");
    ed.commands.setSearch("x", false);
    expect(getSearchState(ed.state)).toMatchObject({ current: 0 });
    expect(getSearchState(ed.state).matches).toHaveLength(3);
    ed.commands.findNext();
    ed.commands.findNext();
    expect(getSearchState(ed.state).current).toBe(2);
    ed.commands.findNext();
    expect(getSearchState(ed.state).current).toBe(0);
    ed.commands.findPrevious();
    expect(getSearchState(ed.state).current).toBe(2);
    ed.commands.clearSearch();
    expect(getSearchState(ed.state).matches).toHaveLength(0);
  });

  it("replaces one or all matches, and skips matches that already equal the replacement", () => {
    const ed = makeEditor("<p>cat Cat cat</p>");
    ed.commands.setSearch("cat", false);
    expect(replaceMatches(ed, "cat")).toEqual({ replaced: 1, skipped: 2 }); // only "Cat" differs
    expect(ed.getText()).toBe("cat cat cat");
    expect(replaceMatches(ed, "cat")).toEqual({ replaced: 0, skipped: 3 });
    ed.commands.setSearch("cat", false);
    expect(replaceMatches(ed, "dog")).toEqual({ replaced: 3, skipped: 0 });
    expect(ed.getText()).toBe("dog dog dog");
  });

  it("keeps formatting around a replaced word and can replace with nothing", () => {
    const ed = makeEditor("<p>keep <strong>bold cat</strong> end</p>");
    ed.commands.setSearch("cat", false);
    replaceMatches(ed, "dog");
    expect(ed.getHTML()).toContain("<strong>bold dog</strong>");
    ed.commands.setSearch("dog", false);
    replaceMatches(ed, "");
    expect(ed.getText()).toBe("keep bold  end");
  });

  it("does not replace in a read-only editor (find still works)", () => {
    const ed = makeEditor("<p>cat cat</p>", { editable: false });
    ed.commands.setSearch("cat", false);
    expect(getSearchState(ed.state).matches).toHaveLength(2);
    expect(replaceMatches(ed, "dog")).toEqual({ replaced: 0, skipped: 0 });
    expect(ed.getText()).toBe("cat cat");
  });
});

describe("keyboard shortcuts", () => {
  const key = (ed: Editor, k: string, keyCode: number, init: KeyboardEventInit = {}) =>
    press(ed, k, { ctrlKey: true, keyCode, ...init } as KeyboardEventInit);

  function withHandlers(content = "<p>hello world</p>") {
    const handlers = { onLink: vi.fn(), onFind: vi.fn(), onReplace: vi.fn() };
    const ed = makeEditor(content, {
      extensions: [
        StarterKit.configure(starterKitOptions),
        ...formattingExtensions,
        SearchReplace,
        EditorShortcuts.configure({ handlers: () => handlers }),
      ],
    });
    return { ed, handlers };
  }

  it("Ctrl+Shift+X toggles strikethrough (and TipTap's old Ctrl+Shift+S no longer does)", () => {
    const { ed } = withHandlers();
    ed.commands.selectAll();
    key(ed, "X", 88, { shiftKey: true });
    expect(ed.isActive("strike")).toBe(true);
    key(ed, "X", 88, { shiftKey: true });
    expect(ed.isActive("strike")).toBe(false);
    key(ed, "S", 83, { shiftKey: true });
    expect(ed.isActive("strike")).toBe(false);
  });

  it("Ctrl+K opens the link dialog, Ctrl+F find, Ctrl+H replace - and the browser default is prevented", () => {
    const { ed, handlers } = withHandlers();
    expect(key(ed, "k", 75).defaultPrevented).toBe(true);
    expect(key(ed, "f", 70).defaultPrevented).toBe(true);
    expect(key(ed, "h", 72).defaultPrevented).toBe(true);
    expect(handlers.onLink).toHaveBeenCalledTimes(1);
    expect(handlers.onFind).toHaveBeenCalledTimes(1);
    expect(handlers.onReplace).toHaveBeenCalledTimes(1);
  });

  it("a read-only editor ignores Ctrl+K and Ctrl+H (find stays available)", () => {
    const handlers = { onLink: vi.fn(), onFind: vi.fn(), onReplace: vi.fn() };
    const ed = makeEditor("<p>hello</p>", {
      editable: false,
      extensions: [StarterKit.configure(starterKitOptions), ...formattingExtensions, EditorShortcuts.configure({ handlers: () => handlers })],
    });
    key(ed, "k", 75);
    key(ed, "h", 72);
    expect(handlers.onLink).not.toHaveBeenCalled();
    expect(handlers.onReplace).not.toHaveBeenCalled();
  });
});

describe("page break (spike)", () => {
  it("Ctrl+Enter inserts a page break, not a hard break", () => {
    const ed = makeEditor("<p>hello world</p>", {
      extensions: [StarterKit.configure(starterKitOptions), ...formattingExtensions, PageBreak],
    });
    ed.commands.setTextSelection(3);
    const e = press(ed, "Enter", { ctrlKey: true, keyCode: 13 } as KeyboardEventInit);
    expect(e.defaultPrevented).toBe(true);
    const json = JSON.stringify(ed.getJSON());
    expect(json).toContain('"pageBreak"');
    expect(json).not.toContain('"hardBreak"');
  });

  it("a page break holds no text, so it cannot add characters", () => {
    const ed = makeEditor("<p>hello world</p>", {
      extensions: [StarterKit.configure(starterKitOptions), ...formattingExtensions, PageBreak],
    });
    const before = ed.state.doc.textContent;
    ed.commands.setPageBreak();
    expect(ed.state.doc.textContent).toBe(before);
    expect(JSON.stringify(ed.getJSON())).toContain('"pageBreak"');
  });
});
