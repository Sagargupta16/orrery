// Every picture carries its spec: an SVG in <metadata>, a PNG in an iTXt chunk, and
// `orrery import picture` reads it back byte for byte, while the picture draws exactly as before.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, inflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { embedPngSpec, embedSvgSpec, extractSpec } from "../src/render/embed.ts";
import { type RenderResult, renderModel } from "../src/render/index.ts";
import { renderPng } from "../src/render/png.ts";
import type { Skin, ThemeName } from "../src/types.ts";
import { model, must, PNG_SIGNATURE, ROOT, SAMPLE, xmlProblems } from "./helpers.ts";

const THEMES: ThemeName[] = ["light", "dark"];
const SKINS: Skin[] = ["classic", "stage"];
const CASES = SKINS.flatMap((skin) => THEMES.map((theme) => [skin, theme] as const));
const METADATA = /\n<metadata>[\s\S]*?<\/metadata>/;
/** With a spec and without one, per skin. */
const runs: Record<string, RenderResult> = {};

const render = (skin: Skin, source?: string) =>
  renderModel({
    model: model(SAMPLE),
    formats: ["svg", "png", "drawio.svg"],
    themes: THEMES,
    name: "orders",
    scale: 1,
    skin,
    source,
  });

beforeAll(async () => {
  for (const skin of SKINS) {
    runs[`${skin} spec`] = await render(skin, SAMPLE);
    runs[`${skin} plain`] = await render(skin);
  }
});

function artifact(run: string, format: string, theme: ThemeName): string | Uint8Array {
  const a = runs[run]?.artifacts.find((x) => x.format === format && x.theme === theme);
  return must(a, `${run} ${format} ${theme}`).data;
}
const svgOf = (run: string, theme: ThemeName, format = "svg") => {
  const data = artifact(run, format, theme);
  if (typeof data !== "string") throw new Error(`${format} is binary`);
  return data;
};
const pngOf = (run: string, theme: ThemeName) => {
  const data = artifact(run, "png", theme);
  if (typeof data === "string") throw new Error("png is text");
  return data;
};

interface PngChunk {
  type: string;
  data: Buffer;
  /** The stored CRC matches zlib's CRC-32 of the type and data. */
  crcOk: boolean;
}

/** The chunk list, read from the bytes with no help from src/render/embed.ts. */
function pngChunks(png: Uint8Array): PngChunk[] {
  const buf = Buffer.from(png.buffer, png.byteOffset, png.byteLength);
  if (!PNG_SIGNATURE.every((b, i) => buf[i] === b)) throw new Error("not a PNG");
  const list: PngChunk[] = [];
  let at = 8;
  while (at < buf.length) {
    const length = buf.readUInt32BE(at);
    const typed = buf.subarray(at + 4, at + 8 + length);
    list.push({
      type: typed.subarray(0, 4).toString("latin1"),
      data: typed.subarray(4),
      crcOk: crc32(typed) === buf.readUInt32BE(at + 8 + length),
    });
    at += 12 + length;
  }
  if (at !== buf.length) throw new Error(`chunks end at ${at}, the file at ${buf.length}`);
  return list;
}

/** The decoded scanlines: every IDAT, joined and inflated. */
const pixels = (png: Uint8Array) =>
  inflateSync(
    Buffer.concat(
      pngChunks(png)
        .filter((c) => c.type === "IDAT")
        .map((c) => c.data),
    ),
  );

describe("SVG", () => {
  it.each(CASES)(
    "%s %s: carries the spec, reads it back and changes nothing else",
    (skin, theme) => {
      const svg = svgOf(`${skin} spec`, theme);
      expect(xmlProblems(svg)).toEqual([]);
      expect(svg.match(/<metadata>/g)).toHaveLength(1);
      expect(svg).toMatch(
        /^<svg\b[^>]*>\n<metadata><orrery:spec xmlns:orrery="https:\/\/sagargupta.online\/orrery\/spec" version="1">/,
      );
      expect(extractSpec(svg)).toBe(SAMPLE);
      expect(svg.replace(METADATA, "")).toBe(svgOf(`${skin} plain`, theme));
    },
  );

  it.each(CASES)("%s %s: draws the same PNG bytes in resvg", async (skin, theme) => {
    const [withSpec, without] = await Promise.all([
      renderPng(svgOf(`${skin} spec`, theme), { scale: 1 }),
      renderPng(svgOf(`${skin} plain`, theme), { scale: 1 }),
    ]);
    expect(Buffer.from(withSpec).equals(Buffer.from(without))).toBe(true);
  });

  it.each(THEMES)("drawio.svg keeps the spec beside the draw.io model (%s)", (theme) => {
    const file = svgOf("classic spec", theme, "drawio.svg");
    expect(xmlProblems(file)).toEqual([]);
    expect(extractSpec(file)).toBe(SAMPLE);
    expect(file.replace(METADATA, "")).toBe(svgOf("classic plain", theme, "drawio.svg"));
  });

  it("escapes markup, CRLF and replacement patterns, and reads every one back", () => {
    const text = [
      'title: "a & b <c> ]]> </orrery:spec> $& $1 $$ &amp;"',
      `subtitle: caf${String.fromCharCode(0xe9)} ${String.fromCodePoint(0x1d11e)}`,
      "edges: [a -> b]",
      "",
    ].join("\r\n");
    const svg = embedSvgSpec('<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>', text);
    expect(xmlProblems(svg)).toEqual([]);
    expect(svg).not.toContain("base64");
    expect(svg).toContain("&#13;\n");
    expect(svg).toContain("a -> b");
    expect(extractSpec(svg)).toBe(text);
  });

  it("falls back to base64 for a character XML cannot carry", () => {
    const text = `title: bell ${String.fromCharCode(7)} here\n`;
    const svg = embedSvgSpec('<svg xmlns="http://www.w3.org/2000/svg"/>', text);
    expect(svg).toContain('encoding="base64"');
    expect(xmlProblems(svg)).toEqual([]);
    expect(extractSpec(svg)).toBe(text);
  });
});

describe("PNG", () => {
  it.each(CASES)("%s %s: one valid iTXt chunk before IEND, the same pixels", (skin, theme) => {
    const png = pngOf(`${skin} spec`, theme);
    const plain = pngOf(`${skin} plain`, theme);
    const chunks = pngChunks(png);
    const before = pngChunks(plain);
    expect(chunks.every((c) => c.crcOk)).toBe(true);
    expect(chunks.map((c) => c.type)).toEqual([
      ...before.slice(0, -1).map((c) => c.type),
      "iTXt",
      "IEND",
    ]);
    // Every chunk the renderer wrote is still there, byte for byte, and decodes the same.
    const kept = chunks.filter((c) => c.type !== "iTXt");
    expect(kept.map((c) => c.data.toString("hex"))).toEqual(
      before.map((c) => c.data.toString("hex")),
    );
    expect(pixels(png).equals(pixels(plain))).toBe(true);

    const itxt = must(
      chunks.find((c) => c.type === "iTXt"),
      "iTXt",
    ).data;
    const keyword = "orrery-spec";
    expect(itxt.subarray(0, keyword.length).toString("latin1")).toBe(keyword);
    // NUL, compressed, zlib, empty language tag, empty translated keyword.
    expect([...itxt.subarray(keyword.length, keyword.length + 5)]).toEqual([0, 1, 0, 0, 0]);
    expect(inflateSync(itxt.subarray(keyword.length + 5)).toString("utf8")).toBe(SAMPLE);
    expect(extractSpec(png)).toBe(SAMPLE);
  });
});

describe("what embeds nothing", () => {
  it("a render with no spec text (library callers)", () => {
    for (const theme of THEMES) {
      expect(svgOf("classic plain", theme)).not.toContain("<metadata");
      expect(pngChunks(pngOf("classic plain", theme)).map((c) => c.type)).not.toContain("iTXt");
      expect(extractSpec(svgOf("classic plain", theme))).toBeUndefined();
      expect(extractSpec(pngOf("classic plain", theme))).toBeUndefined();
    }
  });

  it("a top-level embed: false, written as YAML, a flow mapping or JSON", () => {
    const svg = svgOf("classic plain", "light");
    const png = pngOf("classic plain", "light");
    for (const source of [
      `embed: false\n${SAMPLE}`,
      `${SAMPLE}embed: false # keep notes out of the pictures\n`,
      "{ title: A, embed: false, nodes: { a: { label: A } } }",
      '{ "title": "A", "embed": false, "nodes": { "a": { "label": "A" } } }',
    ]) {
      expect(embedSvgSpec(svg, source)).toBe(svg);
      expect(embedPngSpec(png, source)).toBe(png);
    }
    // Only the top level counts, and only false.
    expect(extractSpec(embedSvgSpec(svg, `${SAMPLE}embed: true\n`))).toBe(`${SAMPLE}embed: true\n`);
    const nested = "title: A\nnodes:\n  a: { label: A, embed: false }\n";
    expect(extractSpec(embedPngSpec(png, nested))).toBe(nested);
  });

  it("renderModel honors embed: false in the spec text", async () => {
    const r = await renderModel({
      model: model(SAMPLE),
      formats: ["svg", "png"],
      themes: ["dark"],
      name: "orders",
      scale: 1,
      source: `embed: false\n${SAMPLE}`,
    });
    for (const a of r.artifacts) expect(extractSpec(a.data)).toBeUndefined();
  });

  it("a picture orrery did not draw", () => {
    expect(
      extractSpec('<svg xmlns="http://www.w3.org/2000/svg"><metadata/></svg>'),
    ).toBeUndefined();
    expect(extractSpec(new Uint8Array([1, 2, 3]))).toBeUndefined();
    expect(extractSpec(new Uint8Array(PNG_SIGNATURE))).toBeUndefined();
  });
});

describe("orrery import picture", () => {
  let dir = "";
  /** CRLF line ends, the way a spec saved on Windows reads. */
  const text = SAMPLE.replace(/\n/g, "\r\n");
  const cli = (...args: string[]) =>
    spawnSync(process.execPath, [join(ROOT, "src", "main.ts"), ...args], {
      cwd: dir,
      encoding: "utf8",
    });

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "orrery-embed-"));
    writeFileSync(join(dir, "x.yaml"), text);
    writeFileSync(join(dir, "other.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const r = cli("render", "x.yaml", "-f", "svg,png", "--theme", "dark", "--scale", "1");
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it.each(["x.svg", "x.png"])("gives back the spec that drew %s, byte for byte", (file) => {
    const r = cli("import", "picture", file);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(text);
  });

  it("stops with a usage error on a picture that carries no spec", () => {
    const r = cli("import", "picture", "other.svg");
    expect(r.status).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("other.svg carries no orrery spec");
  });
});
