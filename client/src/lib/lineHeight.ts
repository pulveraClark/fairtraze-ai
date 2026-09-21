import { Extension } from "@tiptap/core";
import "@tiptap/extension-text-style";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    lineHeight: {
      setLineHeight: (lineHeight: string) => ReturnType;
      unsetLineHeight: () => ReturnType;
    };
  }
}

// Same "extend TextStyle" pattern as FontSize (fontSize.ts) — no official line-height
// extension exists. Inline style on the textStyle mark's <span>, invisible to
// authorshipCapture.ts's plain-text diffing exactly like FontSize/Color.
export const LineHeight = Extension.create({
  name: "lineHeight",

  addOptions() {
    return { types: ["textStyle"] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => element.style.lineHeight || null,
            renderHTML: (attributes) => {
              if (!attributes.lineHeight) return {};
              return { style: `line-height: ${attributes.lineHeight}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineHeight:
        (lineHeight: string) =>
        ({ chain }) => {
          return chain().setMark("textStyle", { lineHeight }).run();
        },
      unsetLineHeight:
        () =>
        ({ chain }) => {
          return chain().setMark("textStyle", { lineHeight: null }).run();
        },
    };
  },
});
