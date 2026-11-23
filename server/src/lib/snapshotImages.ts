import { Y } from "../collab/yjsCjs.js";

// History snapshots keep the document's text and structure but not the image data: a version only
// ever shows an "[image]" marker, and base64 images made one snapshot several megabytes.
// This works on a scratch copy only. Document.yjsState and the live room are never touched.

// A fixed client id makes the re-encoded bytes the same for the same document, so an unchanged
// document produces identical bytes and the snapshot dedupe keeps working.
const SNAPSHOT_CLIENT_ID = 1;

type ParentNode = InstanceType<typeof Y.XmlFragment> | InstanceType<typeof Y.XmlElement>;

function blankIn(node: ParentNode): number {
  let blanked = 0;
  for (const child of node.toArray()) {
    if (!(child instanceof Y.XmlElement)) continue;
    if (child.nodeName === "image") {
      for (const [key, value] of Object.entries(child.getAttributes())) {
        // `src` is the image data; any other attribute carrying a data: URL is blanked too.
        const isPayload = key === "src" || (typeof value === "string" && value.startsWith("data:"));
        if (isPayload && value !== "") {
          child.setAttribute(key, "");
          blanked++;
        }
      }
    }
    blanked += blankIn(child);
  }
  return blanked;
}

/**
 * Returns the state with every image's data blanked and the image node kept as a placeholder.
 * A state without images (or one that cannot be read) comes back unchanged, byte for byte.
 */
export function blankImageData(state: Uint8Array): Uint8Array {
  const scratch = new Y.Doc();
  try {
    scratch.clientID = SNAPSHOT_CLIENT_ID;
    Y.applyUpdate(scratch, state);
    if (blankIn(scratch.getXmlFragment("default")) === 0) return state;
    return Y.encodeStateAsUpdate(scratch);
  } catch (err) {
    console.error("[snapshot] could not read the document state to blank images:", err instanceof Error ? err.message : "unknown error");
    return state;
  } finally {
    scratch.destroy();
  }
}
