// Word output for `orrery doc`: WordprocessingML parts built from the parsed Markdown, packed by a
// small zip writer (deflated or stored entries, one central directory), so Word needs no library.
import { deflateRawSync } from "node:zlib";
import type { Block, DocFigure, Inline } from "./doc.ts";

/** A4 with one inch margins, in twentieths of a point. */
const PAGE = { w: 11906, h: 16838, margin: 1440 };
const TEXT_W = PAGE.w - 2 * PAGE.margin;
/** A tall figure stops at this height, so its caption still fits on the page. */
const MAX_PICTURE_H = (PAGE.h - 2 * PAGE.margin) * 0.8;
const EMU_PER_TWIP = 635;
const EMU_PER_PX = 9525;
const BULLETS = ["•", "◦", "▪"];

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture";
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const CONTENT_TYPES = `${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;

const ROOT_RELS = `${DECL}<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="${REL}/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;

const heading = (n: number, size: number) =>
  `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${n === 1 ? 360 : 280}" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:color w:val="1F2328"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;

const MONO = '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>';
const SOFT = '<w:shd w:val="clear" w:color="auto" w:fill="F6F8FA"/>';

const STYLES = `${DECL}<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>${[
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>',
  heading(1, 36),
  heading(2, 30),
  heading(3, 26),
  '<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="35"/><w:qFormat/><w:pPr><w:spacing w:before="80" w:after="240"/><w:jc w:val="center"/></w:pPr><w:rPr><w:i/><w:color w:val="59636E"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>',
  '<w:style w:type="paragraph" w:customStyle="1" w:styleId="Figure"><w:name w:val="Figure"/><w:basedOn w:val="Normal"/><w:next w:val="Caption"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="0"/><w:jc w:val="center"/></w:pPr></w:style>',
  `<w:style w:type="paragraph" w:customStyle="1" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr>${SOFT}<w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="144" w:right="144"/></w:pPr><w:rPr>${MONO}<w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:style>`,
  '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="29"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="D1D9E0"/></w:pBdr><w:ind w:left="288"/></w:pPr><w:rPr><w:color w:val="59636E"/></w:rPr></w:style>',
  '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="34"/><w:qFormat/><w:pPr><w:spacing w:after="60"/></w:pPr></w:style>',
  `<w:style w:type="character" w:customStyle="1" w:styleId="CodeChar"><w:name w:val="Code Char"/><w:rPr>${MONO}<w:sz w:val="20"/><w:szCs w:val="20"/>${SOFT}</w:rPr></w:style>`,
  '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>',
  '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>',
  `<w:style w:type="table" w:customStyle="1" w:styleId="DocTable"><w:name w:val="Doc Table"/><w:basedOn w:val="TableNormal"/><w:tblPr><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="D1D9E0"/>`).join("")}</w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>`,
].join("")}</w:styles>`;

/** XML text or attribute value; control characters XML 1.0 forbids are dropped. */
const x = (s: string) =>
  s
    .replace(/[^\P{Cc}\t\n\r]/gu, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export interface DocxImage {
  data: Uint8Array;
  /** CSS pixels: a figure's scene size, a plain image's own size. */
  width: number;
  height: number;
}

/** A PNG with its pixel size from the IHDR chunk, or undefined for anything else. */
export function pngImage(data: Uint8Array): DocxImage | undefined {
  const png = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (
    png.length < 24 ||
    png.readUInt32BE(0) !== 0x89504e47 ||
    png.toString("ascii", 12, 16) !== "IHDR"
  )
    return undefined;
  return { data, width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** Picture size in EMU: figures fill the text width, images keep their size up to it. */
function extent(img: DocxImage, fill: boolean): [number, number] {
  const maxW = TEXT_W * EMU_PER_TWIP;
  const maxH = MAX_PICTURE_H * EMU_PER_TWIP;
  let cx = fill ? maxW : Math.min(maxW, img.width * EMU_PER_PX);
  let cy = (cx * img.height) / img.width;
  if (cy > maxH) {
    cx = (cx * maxH) / cy;
    cy = maxH;
  }
  return [Math.round(cx), Math.round(cy)];
}

export interface DocxInput {
  title: string;
  blocks: Block[];
  figures: Map<number, DocFigure>;
  /** A Markdown image's PNG, or undefined to print its alt text instead. */
  image: (src: string) => DocxImage | undefined;
}

interface Fmt {
  b?: boolean;
  i?: boolean;
  style?: string;
}

const para = (pPr: string, content: string) =>
  `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${content}</w:p>`;
const style = (id: string) => `<w:pStyle w:val="${id}"/>`;

function run(text: string, f: Fmt = {}): string {
  const rPr =
    f.style || f.b || f.i
      ? `<w:rPr>${f.style ? `<w:rStyle w:val="${f.style}"/>` : ""}${f.b ? "<w:b/>" : ""}${f.i ? "<w:i/>" : ""}</w:rPr>`
      : "";
  return `<w:r>${rPr}<w:t xml:space="preserve">${x(text)}</w:t></w:r>`;
}

/** The .docx file and the number of figure pictures its document.xml holds. */
export function renderDocx(input: DocxInput): { data: Uint8Array; figures: number } {
  const rels = [`<Relationship Id="rId1" Type="${R}/styles" Target="styles.xml"/>`];
  const media: [string, Uint8Array][] = [];
  const rel = (type: string, target: string, external = false) => {
    const id = `rId${rels.length + 1}`;
    rels.push(
      `<Relationship Id="${id}" Type="${R}/${type}" Target="${x(target)}"${external ? ' TargetMode="External"' : ""}/>`,
    );
    return id;
  };
  const picture = (img: DocxImage, name: string, alt: string, fill: boolean) => {
    const n = media.length + 1;
    const file = `image${n}.png`;
    media.push([`word/media/${file}`, img.data]);
    const id = rel("image", `media/${file}`);
    const [cx, cy] = extent(img, fill);
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${n}" name="${x(name)}" descr="${x(alt)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="${PIC}"><pic:pic><pic:nvPicPr><pic:cNvPr id="${n}" name="${file}" descr="${x(alt)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  };

  const runs = (list: Inline[], f: Fmt = {}): string =>
    list
      .map((n) => {
        switch (n.t) {
          case "text":
            return run(n.s, f);
          case "code":
            return run(n.s, { ...f, style: "CodeChar" });
          case "strong":
            return runs(n.c, { ...f, b: true });
          case "em":
            return runs(n.c, { ...f, i: true });
          case "link":
            return /^(https?|mailto):/i.test(n.href)
              ? `<w:hyperlink r:id="${rel("hyperlink", n.href, true)}" w:history="1">${runs(n.c, { ...f, style: "Hyperlink" })}</w:hyperlink>`
              : runs(n.c, f);
          case "img": {
            const img = input.image(n.src);
            return img
              ? picture(img, `Image ${media.length + 1}`, n.alt, false)
              : run(`[${n.alt || n.src}]`, { ...f, i: true });
          }
          default:
            return "<w:r><w:br/></w:r>";
        }
      })
      .join("");

  const table = (b: Extract<Block, { t: "table" }>) => {
    const w = Math.floor(TEXT_W / Math.max(1, b.head.length));
    // Keep-with-next on every row but the last holds a short table on one page.
    const cell = (c: Inline[], k: number, head: boolean, last: boolean) => {
      const jc = b.align[k] ? `<w:jc w:val="${b.align[k]}"/>` : "";
      return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${head ? SOFT : ""}</w:tcPr>${para(`${last ? "" : "<w:keepNext/>"}<w:spacing w:after="0"/>${jc}`, runs(c, head ? { b: true } : {}))}</w:tc>`;
    };
    const row = (cells: Inline[][], head: boolean, last: boolean) =>
      `<w:tr>${head ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${cells.map((c, k) => cell(c, k, head, last)).join("")}</w:tr>`;
    const rows = b.rows.map((r, k) => row(r, false, k === b.rows.length - 1)).join("");
    // The empty paragraph keeps two tables apart and gives the one before the section a successor.
    return `<w:tbl><w:tblPr><w:tblStyle w:val="DocTable"/><w:tblW w:w="5000" w:type="pct"/></w:tblPr><w:tblGrid>${b.head.map(() => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${row(b.head, true, !b.rows.length)}${rows}</w:tbl>${para("", "")}`;
  };

  const block = (b: Block, quote: boolean): string => {
    switch (b.t) {
      case "heading":
        return para(style(quote ? "Quote" : `Heading${Math.min(b.level, 3)}`), runs(b.c));
      case "para":
        return para(quote ? style("Quote") : "", runs(b.c));
      case "list":
        return b.items
          .map((it, k) => {
            const left = 720 + it.depth * 360 + (quote ? 288 : 0);
            const mark = it.ordered ? `${it.num}.` : (BULLETS[it.depth % BULLETS.length] ?? "");
            const end = k === b.items.length - 1 ? '<w:spacing w:after="160"/>' : "";
            return para(
              `${style("ListParagraph")}${end}<w:ind w:left="${left}" w:hanging="360"/>`,
              `${run(mark)}<w:r><w:tab/></w:r>${runs(it.c)}`,
            );
          })
          .join("");
      case "code": {
        const lines = b.s.split("\n");
        return lines
          .map((l, k) =>
            para(
              `${style("Code")}${k === lines.length - 1 ? '<w:spacing w:after="160"/>' : ""}`,
              l ? run(l.replaceAll("\t", "    ")) : "",
            ),
          )
          .join("");
      }
      case "table":
        return table(b);
      case "quote":
        return b.c.map((c) => block(c, true)).join("");
      case "hr":
        return para(
          '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D1D9E0"/></w:pBdr>',
          "",
        );
      case "figure": {
        const f = input.figures.get(b.n);
        if (!f?.png) return "";
        const img = { data: f.png, width: f.width, height: f.height };
        return `${para(style("Figure"), picture(img, `Figure ${b.n}`, f.caption, true))}${para(style("Caption"), `${run("Figure ")}<w:fldSimple w:instr=" SEQ Figure \\* ARABIC "><w:r><w:t>${b.n}</w:t></w:r></w:fldSimple>${run(`: ${f.caption}`)}`)}`;
      }
    }
  };

  const m = PAGE.margin;
  const body = input.blocks.map((b) => block(b, false)).join("") || "<w:p/>";
  const document = `${DECL}<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="${WP}" xmlns:a="${A}" xmlns:pic="${PIC}"><w:body>${body}<w:sectPr><w:pgSz w:w="${PAGE.w}" w:h="${PAGE.h}"/><w:pgMar w:top="${m}" w:right="${m}" w:bottom="${m}" w:left="${m}" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const core = `${DECL}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${x(input.title)}</dc:title></cp:coreProperties>`;
  const data = zip([
    ["[Content_Types].xml", CONTENT_TYPES],
    ["_rels/.rels", ROOT_RELS],
    ["docProps/core.xml", core],
    ["word/document.xml", document],
    ["word/styles.xml", STYLES],
    [
      "word/_rels/document.xml.rels",
      `${DECL}<Relationships xmlns="${REL}">${rels.join("")}</Relationships>`,
    ],
    ...media,
  ]);
  return { data, figures: document.match(/<wp:docPr id="\d+" name="Figure \d+"/g)?.length ?? 0 };
}

// ---------------------------------------------------------------- zip

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** zlib.crc32 arrived in Node 22.2; the table keeps 22.0 and 22.1 working. */
function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 1980-01-01 00:00 in DOS form, so the same document always zips to the same bytes. */
const DOS_DATE = (1 << 5) | 1;

/** A zip archive of the files in order: deflated, or stored when deflate does not shrink one. */
export function zip(files: [name: string, data: string | Uint8Array][]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of files) {
    const raw = typeof content === "string" ? Buffer.from(content, "utf8") : content;
    const deflated = deflateRawSync(raw, { level: 9 });
    const stored = deflated.length >= raw.length;
    const body = stored ? raw : deflated;
    const file = Buffer.from(name, "utf8");
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(file.length, 26);
    parts.push(local, file, body);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(stored ? 0 : 8, 10);
    entry.writeUInt16LE(DOS_DATE, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(file.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, file);
    offset += local.length + file.length + body.length;
  }
  const size = central.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}
