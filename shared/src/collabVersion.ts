// Version of the shared (Yjs) document SCHEMA - bumped only when a change means an older client
// would mis-handle the shared document. It is not the build number: most deploys leave it alone, so
// open tabs are not interrupted by unrelated releases.
//
// Why it exists: y-prosemirror DELETES any element its schema does not know and syncs that deletion
// to everyone (measured in client/e2e/schemaMismatch.mjs). A tab opened before `pageBreak` shipped
// would therefore erase every page break in the shared document. The collab server refuses a
// client whose version differs, and a client shows a reload banner and stops sending updates.
//
// History: 1 = original schema (also what a client that sends no version is assumed to be);
//          2 = adds the `pageBreak` node.
export const COLLAB_SCHEMA_VERSION = 2;

/** WebSocket close code the collab server uses to say "your client is out of date". */
export const COLLAB_VERSION_CLOSE_CODE = 4409;

/**
 * How long the collab server waits after the last change before it saves the document to the database
 * (the debounced save in server/src/collab/persistence.ts, `DEBOUNCE_MS`). The client's "All changes saved"
 * indicator waits at least this long after a local edit (client/src/lib/saveState.ts). Timing only; not part
 * of the document schema. client/src/lib/saveState.test.ts fails if this stops matching persistence.ts.
 */
export const COLLAB_PERSIST_DEBOUNCE_MS = 3000;
