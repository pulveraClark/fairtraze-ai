import JSZip from "jszip";

// Hand-builds a minimal, valid .docx (OOXML zip) in-memory for tests — avoids committing binary
// fixture files to the repo. Mammoth's default style map recognizes headings by STYLE NAME (read
// from word/styles.xml), not by raw styleId, so a heading paragraph needs both a pStyle
// reference and a matching <w:name w:val="heading N"/> definition.
const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`;

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type DocxFixtureBlock = { heading: string; level?: 1 | 2 } | { paragraph: string };

// Builds a minimal .docx from an ordered list of heading/paragraph blocks. No blocks -> a
// structurally valid but textually empty document (for the "empty file" test case).
export async function buildTestDocx(blocks: DocxFixtureBlock[] = []): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES_XML);
  zip.file("_rels/.rels", RELS_XML);
  zip.file("word/_rels/document.xml.rels", DOCUMENT_RELS_XML);
  zip.file("word/styles.xml", STYLES_XML);

  const bodyXml = blocks
    .map((block) => {
      if ("heading" in block) {
        const styleId = block.level === 2 ? "Heading2" : "Heading1";
        return `<w:p><w:pPr><w:pStyle w:val="${styleId}"/></w:pPr><w:r><w:t>${escapeXml(block.heading)}</w:t></w:r></w:p>`;
      }
      return `<w:p><w:r><w:t>${escapeXml(block.paragraph)}</w:t></w:r></w:p>`;
    })
    .join("");

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${bodyXml}</w:body>
</w:document>`;
  zip.file("word/document.xml", documentXml);

  return zip.generateAsync({ type: "nodebuffer" });
}
