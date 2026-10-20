// orrery doc: Markdown with figure markers to HTML, Markdown plus figure files, and Word.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, inflateRawSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDoc, type DocFormat, parseDoc } from "../src/doc/index.ts";
import { PNG_SIGNATURE, pngSize, xmlProblems } from "./helpers.ts";

const TINY = "title: Two boxes\nnodes: { a: Alpha, b: Beta }\nedges:\n  - a -> b\n";

const DOC = `---
title: Orders design
status: draft
---
# Orders platform

Intro with **bold**, *italic*, \`code\` and [a link](https://example.com).

<!-- orrery: diagrams/tiny.yaml | Request path, step by step -->

## Plan

1. First
2. Second
   - nested bullet
3. Third

| Part | Owner |
| :--- | ---: |
| API | team a |

\`\`\`yaml
<!-- orrery: not-a-figure.yaml -->
\`\`\`

<!-- orrery: diagrams/tiny.yaml -->
`;

let dir = "";

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "orrery-doc-"));
  mkdirSync(join(dir, "diagrams"));
  writeFileSync(join(dir, "diagrams", "tiny.yaml"), TINY);
});

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

/** Writes a document into its own folder (so outputs never collide) and builds it. */
async function build(name: string, text: string, formats: DocFormat[]) {
  const sub = join(dir, name);
  mkdirSync(sub, { recursive: true });
  const file = join(sub, "design.md");
  writeFileSync(file, text.replaceAll("diagrams/", "../diagrams/"));
  const result = await buildDoc({ file, base: join(sub, "out", "design"), formats });
  return { ...result, out: join(sub, "out") };
}

/** Reads a zip through its central directory, checking each local header and CRC on the way. */
function unzip(zip: Buffer): Map<string, Buffer> {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error("no end of central directory record");
  const files = new Map<string, Buffer>();
  let p = zip.readUInt32LE(end + 16);
  for (let k = 0; k < zip.readUInt16LE(end + 10); k++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error(`no central entry at ${p}`);
    const method = zip.readUInt16LE(p + 10);
    const crc = zip.readUInt32LE(p + 16);
    const size = zip.readUInt32LE(p + 20);
    const nameLength = zip.readUInt16LE(p + 28);
    const offset = zip.readUInt32LE(p + 42);
    const name = zip.toString("utf8", p + 46, p + 46 + nameLength);
    if (zip.readUInt32LE(offset) !== 0x04034b50) throw new Error(`no local header for ${name}`);
    const start = offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28);
    const raw = zip.subarray(start, start + size);
    const data = method === 8 ? inflateRawSync(raw) : raw;
    if (crc32(data) !== crc) throw new Error(`CRC mismatch in ${name}`);
    files.set(name, data);
    p += 46 + nameLength + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
  }
  return files;
}

describe("orrery doc", () => {
  it("numbers markers in document order and skips the ones in code", () => {
    const doc = parseDoc(DOC);
    expect(doc.title).toBe("Orders design");
    expect(doc.markers).toEqual([
      { n: 1, spec: "diagrams/tiny.yaml", caption: "Request path, step by step", line: 8 },
      { n: 2, spec: "diagrams/tiny.yaml", caption: undefined, line: 25 },
    ]);
    expect(doc.markerLines).toEqual([9, 26]);
    expect(doc.blocks.map((b) => b.t)).toEqual([
      "heading",
      "para",
      "figure",
      "heading",
      "list",
      "table",
      "code",
      "figure",
    ]);
    const list = doc.blocks.find((b) => b.t === "list");
    expect(list?.t === "list" && list.items.map((i) => [i.depth, i.ordered, i.num])).toEqual([
      [0, true, 1],
      [0, true, 2],
      [1, false, 0],
      [0, true, 3],
    ]);
    const table = doc.blocks.find((b) => b.t === "table");
    expect(table?.t === "table" && table.align).toEqual(["left", "right"]);
  });

  it("counts a marker inside a quote but does not take it as a figure", () => {
    const doc = parseDoc("# T\n\n> <!-- orrery: a.yaml -->\n\nText <!-- orrery: b.yaml --> here\n");
    expect(doc.markers).toEqual([]);
    expect(doc.markerLines).toEqual([3, 5]);
  });

  it("escapes every piece of text in the HTML", async () => {
    const r = await build(
      "escape",
      [
        "# Title <b>bold</b> & co",
        "",
        '<script>alert("x")</script> and a & b',
        "",
        "[click](javascript:alert(1)) `<i>code</i>`",
        "",
        "| <u>u</u> | x |",
        "| --- | --- |",
        "| <s>s</s> | & |",
        "",
        "```",
        "</code></pre><script>",
        "```",
      ].join("\n"),
      ["html"],
    );
    expect(r.diagnostics).toEqual([]);
    const html = readFileSync(join(r.out, "design.html"), "utf8");
    expect(html).not.toMatch(/<script|<b>|<i>|<u>|<s>|javascript:/);
    expect(html).toContain("<title>Title &lt;b&gt;bold&lt;/b&gt; &amp; co</title>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; and a &amp; b");
    expect(html).toContain('<a href="#">click</a> <code>&lt;i&gt;code&lt;/i&gt;</code>');
    expect(html).toContain("<pre><code>&lt;/code&gt;&lt;/pre&gt;&lt;script&gt;</code></pre>");
  });

  it("writes HTML with numbered inline figures whose ids do not collide", async () => {
    const r = await build("html", DOC, ["html"]);
    expect(r.diagnostics).toEqual([]);
    expect(r.outputs).toMatchObject([{ format: "html", figures: 2 }]);
    const html = readFileSync(join(r.out, "design.html"), "utf8");
    expect(html.match(/<figure class="orrery"/g)).toHaveLength(2);
    expect(html).toContain("<figcaption>Figure 1: Request path, step by step</figcaption>");
    expect(html).toContain("<figcaption>Figure 2: Two boxes</figcaption>");
    expect(html).toContain('data-theme="light"');
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(4);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("writes Markdown with an image and caption per marker and the figure files", async () => {
    const r = await build("md", DOC, ["md"]);
    expect(r.diagnostics).toEqual([]);
    const md = readFileSync(join(r.out, "design.md"), "utf8");
    expect(md).toContain(
      "![Request path, step by step](figures/01-tiny.svg)\n\n*Figure 1: Request path, step by step*",
    );
    expect(md).toContain("![Two boxes](figures/02-tiny.svg)\n\n*Figure 2: Two boxes*");
    expect(md).toContain("<!-- orrery: not-a-figure.yaml -->");
    expect(md).not.toContain("<!-- orrery: ../diagrams/");
    expect(r.files.map((f) => f.slice(r.out.length + 1).replaceAll("\\", "/"))).toEqual([
      "figures/01-tiny.svg",
      "figures/01-tiny.png",
      "figures/02-tiny.svg",
      "figures/02-tiny.png",
    ]);
    const svg = readFileSync(join(r.out, "figures", "01-tiny.svg"), "utf8");
    const png = readFileSync(join(r.out, "figures", "01-tiny.png"));
    expect([...png.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
    const width = Number(/<svg[^>]*\swidth="(\d+(?:\.\d+)?)"/.exec(svg)?.[1]);
    expect(pngSize(png).width).toBe(Math.round(width * 2));
  });

  it("writes a Word file whose zip and XML parts read back", async () => {
    const r = await build("docx", DOC, ["docx"]);
    expect(r.diagnostics).toEqual([]);
    expect(r.outputs).toMatchObject([{ format: "docx", figures: 2 }]);
    const files = unzip(readFileSync(join(r.out, "design.docx")));
    expect([...files.keys()]).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "docProps/core.xml",
      "word/document.xml",
      "word/styles.xml",
      "word/_rels/document.xml.rels",
      "word/media/image1.png",
      "word/media/image2.png",
    ]);
    for (const [name, data] of files)
      if (/\.(xml|rels)$/.test(name)) expect(xmlProblems(data.toString("utf8")), name).toEqual([]);
    const document = files.get("word/document.xml")?.toString("utf8") ?? "";
    for (const style of ["Heading1", "Heading2", "Caption", "Figure", "Code", "ListParagraph"])
      expect(document).toContain(`<w:pStyle w:val="${style}"/>`);
    expect(document.match(/<pic:pic>/g)).toHaveLength(2);
    expect(document).toContain('name="Figure 1" descr="Request path, step by step"');
    expect(document).toContain("<w:tbl>");
    expect(document).toContain("SEQ Figure");
    const styles = files.get("word/styles.xml")?.toString("utf8") ?? "";
    for (const id of ["Heading1", "Heading2", "Heading3", "Caption"])
      expect(styles).toContain(`w:styleId="${id}"`);
    const rels = files.get("word/_rels/document.xml.rels")?.toString("utf8") ?? "";
    for (const m of rels.matchAll(/Target="(media\/[^"]+)"/g))
      expect(files.has(`word/${m[1]}`)).toBe(true);
    const media = files.get("word/media/image1.png") ?? Buffer.alloc(0);
    expect([...media.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
    // The picture fills the 6.27 inch text width and keeps the PNG's aspect ratio.
    const [cx = 0, cy = 0] = (/<wp:extent cx="(\d+)" cy="(\d+)"/.exec(document) ?? [])
      .slice(1)
      .map(Number);
    const size = pngSize(media);
    expect(cx).toBe(9026 * 635);
    expect(cy / cx).toBeCloseTo(size.height / size.width, 2);
  });

  it("fails on a missing spec and writes nothing", async () => {
    const r = await build("missing", "# T\n\n<!-- orrery: diagrams/none.yaml | Gone -->\n", [
      "html",
      "md",
      "docx",
    ]);
    expect(r.diagnostics).toMatchObject([
      { severity: "error", code: "DG401", subject: { figure: 1, line: 3 } },
    ]);
    expect(r.outputs).toEqual([]);
    expect(existsSync(r.out)).toBe(false);
  });

  it("fails when a marker never becomes a figure", async () => {
    const r = await build(
      "stray",
      "# T\n\n<!-- orrery: diagrams/tiny.yaml -->\n\n> <!-- orrery: x.yaml -->\n",
      ["html"],
    );
    expect(r.diagnostics).toMatchObject([
      { severity: "error", code: "DG402", evidence: { figures: 1, markers: 2, lines: [5] } },
    ]);
    expect(existsSync(r.out)).toBe(false);
  });
});
