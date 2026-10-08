import type { Editor } from "@tiptap/react";
import { isSupportedImageHeader } from "./imageSniff";

// 2MB — client-side only. Image insertion never hits a REST route (it's written straight into
// the live Yjs doc), so unlike docx import there is no server-side re-check of this cap — a
// modified client could bypass it. Documented limitation, see CLAUDE.md.
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// Shared by the toolbar file-picker (DocumentEditor.tsx's handleImageFileChange) and the
// clipboard-paste handler, so both entry points run the exact same size cap + magic-byte
// content-sniff validation and write through the same editor.chain().setImage() path.
export async function insertImageFile(
  file: File,
  editor: Editor,
  onError: (message: string) => void
): Promise<void> {
  if (file.size > MAX_IMAGE_BYTES) {
    onError(`Image is too large — the limit is ${MAX_IMAGE_BYTES / (1024 * 1024)}MB.`);
    return;
  }

  try {
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (!isSupportedImageHeader(header)) {
      onError("Only PNG, JPEG, and WebP images are supported.");
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string); // "data:<mime>;base64,<data>"
      reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
      reader.readAsDataURL(file);
    });

    // Deliberately two separate commands, not one chained `.focus().setImage(...).run()`:
    // when focus() can't resync the view's DOM focus (observed after the FileReader await —
    // e.g. right after a paste, where the editor already has focus and a redundant focus()
    // call can no-op-fail) a single combined chain drops the whole transaction, silently
    // discarding the image. Splitting them means a focus() no-op can never block the insert.
    editor.chain().focus().run();
    editor.chain().setImage({ src: dataUrl }).run();
  } catch (err) {
    console.error("[image insert] failed", err);
    onError("Could not insert image — check the file and try again.");
  }
}
