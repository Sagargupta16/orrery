// The spec inside its own pictures: an SVG carries it in <metadata>, a PNG in an iTXt chunk, so
// `orrery import picture` turns any rendered file back into the spec that drew it.
//
// The SVG holds the spec as escaped text, not base64: it stays readable and searchable in the
// file, a one-line spec edit is a one-line diff, and it costs a few bytes instead of a third more.
// Line ends go in as LF, so a spec checked out with CRLF on Windows draws the same picture as the
// LF file git stores; a lone carriage return goes in as &#13; because XML parsers fold it into
// LF. Only a spec with a character XML 1.0 cannot carry at all (a control character other than
// tab and line breaks, U+FFFE, U+FFFF) goes in as base64, marked encoding="base64". Viewers draw
// neither: <metadata> renders nothing, and an iTXt chunk is ancillary, so the pixels stay as they
// were.
import { deflateSync, inflateSync } from "node:zlib";
import { parse } from "yaml";

const NAMESPACE = "https://sagargupta.online/orrery/spec";
/** The embedding's own format, raised if the markup or the chunk layout ever changes. */
const VERSION = 1;
const KEYWORD = "orrery-spec";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const NOT_XML = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u;
const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

const isPng = (bytes: Uint8Array) => PNG_SIGNATURE.every((b, i) => bytes[i] === b);

/** Whether there is spec text to embed: some, and no top-level `embed: false` in it. */
function embeds(source: string | undefined): source is string {
  if (!source) return false;
  try {
    const top: unknown = parse(source, { logLevel: "silent" });
    return !(top && typeof top === "object" && (top as { embed?: unknown }).embed === false);
  } catch {
    return true;
  }
}

/** The spec with LF line ends, the way git stores it. */
const lf = (source: string) => source.replace(/\r\n/g, "\n");

/** The SVG with the spec embedded; unchanged when there is no spec text. */
export function embedSvgSpec(svg: string, source?: string): string {
  if (!embeds(source)) return svg;
  const text = lf(source);
  const plain = !NOT_XML.test(text);
  const body = plain
    ? text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/]]>/g, "]]&gt;")
        .replace(/\r/g, "&#13;")
    : Buffer.from(text, "utf8").toString("base64");
  const attrs = `xmlns:orrery="${NAMESPACE}" version="${VERSION}"${plain ? "" : ' encoding="base64"'}`;
  const metadata = `\n<metadata><orrery:spec ${attrs}>${body}</orrery:spec></metadata>`;
  // A function, so a `$&` or `$1` in the spec is not read as a replacement pattern.
  return svg.replace(/<svg\b[^>]*>/, (root) =>
    root.endsWith("/>") ? `${root.slice(0, -2)}>${metadata}\n</svg>` : `${root}${metadata}`,
  );
}

/** The PNG with the spec in an iTXt chunk just before IEND; unchanged when there is no spec text. */
export function embedPngSpec(png: Uint8Array, source?: string): Uint8Array {
  if (!embeds(source)) return png;
  const end = chunks(png).find((c) => c.type === "IEND");
  if (!end) return png;
  // Keyword, NUL, compressed, zlib, empty language tag and NUL, empty translated keyword and NUL.
  const header = [...Buffer.from(KEYWORD, "latin1"), 0, 1, 0, 0, 0];
  const data = concat([
    new Uint8Array(header),
    deflateSync(Buffer.from(lf(source), "utf8"), { level: 9 }),
  ]);
  return concat([png.subarray(0, end.at), chunk("iTXt", data), png.subarray(end.at)]);
}

/** The spec text a picture carries, from an SVG string or PNG bytes; undefined when it has none. */
export function extractSpec(file: string | Uint8Array): string | undefined {
  if (typeof file !== "string") {
    if (!isPng(file)) return extractSpec(new TextDecoder().decode(file));
    for (const c of chunks(file)) {
      const text = c.type === "iTXt" ? readItxt(c.data) : undefined;
      if (text !== undefined) return text;
    }
    return undefined;
  }
  const m = /<orrery:spec\b([^>]*)>([\s\S]*?)<\/orrery:spec>/.exec(file);
  if (!m) return undefined;
  const [, attrs = "", body = ""] = m;
  if (/\sencoding="base64"/.test(attrs)) return Buffer.from(body, "base64").toString("utf8");
  return body.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[\da-fA-F]+);/g, (_, name: string) =>
    name.startsWith("#")
      ? String.fromCodePoint(Number(name[1] === "x" ? `0${name.slice(1)}` : name.slice(1)))
      : (ENTITIES[name] ?? ""),
  );
}

/** The text of an `orrery-spec` iTXt chunk; undefined for any other keyword. */
function readItxt(data: Uint8Array): string | undefined {
  const keyEnd = data.indexOf(0);
  if (Buffer.from(data.subarray(0, keyEnd)).toString("latin1") !== KEYWORD) return undefined;
  const compressed = data[keyEnd + 1] === 1;
  const languageEnd = data.indexOf(0, keyEnd + 3);
  const translatedEnd = data.indexOf(0, languageEnd + 1);
  if (languageEnd < 0 || translatedEnd < 0) return undefined;
  const text = data.subarray(translatedEnd + 1);
  return new TextDecoder().decode(compressed ? inflateSync(text) : text);
}

interface Chunk {
  type: string;
  /** Offset of the chunk's length field. */
  at: number;
  data: Uint8Array;
}

/** The chunks of a PNG in file order; empty when the bytes are not a PNG. */
function chunks(png: Uint8Array): Chunk[] {
  if (!isPng(png)) return [];
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const list: Chunk[] = [];
  for (let at = 8; at + 12 <= png.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    list.push({ type, at, data: png.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
  }
  return list;
}

/** One PNG chunk: length, type, data and the CRC of type and data. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(Buffer.from(type, "latin1"), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

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
