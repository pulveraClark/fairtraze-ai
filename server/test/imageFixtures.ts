import { Y } from "../src/collab/yjsCjs.js";

// A PNG-shaped data URL: real signature + IHDR (so width/height read back), filler bytes after that.
// `seed` changes the content (and so the hash); `bytes` sets the decoded size.
export function pngDataUrl(width: number, height: number, bytes = 20_000, seed = 1): string {
  const buf = Buffer.alloc(Math.max(bytes, 33), seed);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return "data:image/png;base64," + buf.toString("base64");
}

export function insertImage(fragment: InstanceType<typeof Y.XmlFragment>, index: number, src: string) {
  const image = new Y.XmlElement("image");
  image.setAttribute("src", src);
  fragment.insert(index, [image]);
}
