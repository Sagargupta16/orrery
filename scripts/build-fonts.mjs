#!/usr/bin/env node
// Vendors the Inter font files the PNG renderer embeds and writes the advance-width table the
// layout uses to measure labels, so text fits the same way in the SVG, the PNG and draw.io.
//
//   node scripts/build-fonts.mjs
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "skills/diagramify/assets/fonts");
const cacheDir = join(root, ".cache/fonts");

const INTER = {
  url: "https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip",
  sha256: "9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e",
  files: {
    "extras/ttf/Inter-Regular.ttf": "Inter-Regular.ttf",
    "extras/ttf/Inter-SemiBold.ttf": "Inter-SemiBold.ttf",
    "LICENSE.txt": "Inter-OFL.txt",
  },
};

async function fetchZip() {
  mkdirSync(cacheDir, { recursive: true });
  const cached = join(cacheDir, "Inter-4.1.zip");
  let buf;
  if (existsSync(cached)) buf = readFileSync(cached);
  else {
    const res = await fetch(INTER.url);
    if (!res.ok) throw new Error(`GET ${INTER.url} -> HTTP ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(cached, buf);
  }
  const sha = createHash("sha256").update(buf).digest("hex");
  if (sha !== INTER.sha256) throw new Error(`Inter zip checksum mismatch: ${sha}`);
  return unzipSync(new Uint8Array(buf));
}

// Minimal TrueType reader: head, hhea, hmtx and cmap (formats 4 and 12) are all the layout needs.
function readFont(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = {};
  const numTables = view.getUint16(4);
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const tag = String.fromCharCode(...bytes.subarray(rec, rec + 4));
    tables[tag] = view.getUint32(rec + 8);
  }
  const head = tables.head;
  const hhea = tables.hhea;
  const unitsPerEm = view.getUint16(head + 18);
  const ascender = view.getInt16(hhea + 4);
  const descender = view.getInt16(hhea + 6);
  const numberOfHMetrics = view.getUint16(hhea + 34);
  const advance = (glyph) =>
    view.getUint16(tables.hmtx + Math.min(glyph, numberOfHMetrics - 1) * 4);

  const cmap = tables.cmap;
  const n = view.getUint16(cmap + 2);
  let sub4 = null;
  let sub12 = null;
  for (let i = 0; i < n; i++) {
    const rec = cmap + 4 + i * 8;
    const platform = view.getUint16(rec);
    const encoding = view.getUint16(rec + 2);
    const offset = cmap + view.getUint32(rec + 4);
    const format = view.getUint16(offset);
    if (format === 12 && (platform === 3 || platform === 0)) sub12 = offset;
    if (format === 4 && ((platform === 3 && encoding === 1) || platform === 0)) sub4 = offset;
  }
  const map = new Map();
  if (sub12 !== null) {
    const groups = view.getUint32(sub12 + 12);
    for (let g = 0; g < groups; g++) {
      const rec = sub12 + 16 + g * 12;
      const start = view.getUint32(rec);
      const end = view.getUint32(rec + 4);
      const glyph = view.getUint32(rec + 8);
      for (let cp = start; cp <= end && cp <= 0xffff; cp++) map.set(cp, glyph + (cp - start));
    }
  } else if (sub4 !== null) {
    const segX2 = view.getUint16(sub4 + 6);
    const ends = sub4 + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const ranges = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = view.getUint16(ends + s * 2);
      const start = view.getUint16(starts + s * 2);
      const delta = view.getInt16(deltas + s * 2);
      const range = view.getUint16(ranges + s * 2);
      for (let cp = start; cp <= end && cp !== 0xffff; cp++) {
        let glyph;
        if (range === 0) glyph = (cp + delta) & 0xffff;
        else {
          const at = ranges + s * 2 + range + (cp - start) * 2;
          glyph = view.getUint16(at);
          if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
        }
        if (glyph) map.set(cp, glyph);
      }
    }
  }
  const widths = {};
  for (const [cp, glyph] of [...map].sort((a, b) => a[0] - b[0])) widths[cp] = advance(glyph);
  return { unitsPerEm, ascender, descender, widths };
}

const zip = await fetchZip();
mkdirSync(outDir, { recursive: true });
const metrics = { family: "Inter", version: "4.1", weights: {} };
for (const [from, to] of Object.entries(INTER.files)) {
  const bytes = zip[from];
  if (!bytes) throw new Error(`missing ${from} in the Inter release`);
  writeFileSync(join(outDir, to), bytes);
  if (!to.endsWith(".ttf")) continue;
  const font = readFont(bytes);
  const weight = to.includes("SemiBold") ? "600" : "400";
  metrics.unitsPerEm = font.unitsPerEm;
  metrics.ascender = font.ascender;
  metrics.descender = font.descender;
  // Widths as one string per weight keeps the file small: "cp:w,cp:w" with runs of +1 code points.
  const entries = Object.entries(font.widths).map(([cp, w]) => [Number(cp), w]);
  const parts = [];
  let prev = -2;
  for (const [cp, w] of entries) {
    parts.push(cp === prev + 1 ? `${w}` : `${cp}:${w}`);
    prev = cp;
  }
  metrics.weights[weight] = parts.join(",");
  console.log(`${to}: ${entries.length} code points, ${bytes.length} bytes`);
}
writeFileSync(join(outDir, "metrics.json"), `${JSON.stringify(metrics)}\n`);
