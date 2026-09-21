import { createRequire } from "module";
import type * as YTypes from "yjs";

// y-websocket's bin/utils (and @tiptap/y-tiptap's own CJS build) load yjs via CommonJS
// `require`. If any of our own code loaded yjs via a plain ESM `import` instead, Node would
// evaluate a second copy of the module in this process — instances built from one copy fail
// `instanceof` checks in the other. Every server-side module that needs `instanceof Y.XmlText`
// (etc.) checks must import `Y` from here, not `import * as Y from "yjs"` directly.
const require = createRequire(import.meta.url);
export const Y = require("yjs") as typeof YTypes;
