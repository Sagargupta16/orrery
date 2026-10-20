// Builds a design document from Markdown whose `<!-- orrery: spec.yaml | caption -->` markers
// become numbered figures: inline SVG in HTML, image files next to Markdown, PNGs in Word.
//
// doc/inline.ts and doc/markdown.ts parse the Markdown, doc/figures.ts renders the figures, and
// doc/html.ts, doc/md.ts and doc/docx.ts (with doc/zip.ts) write the formats; this file builds
// them all and is the `orrery doc` command.
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import type { Args } from "../cli/args.ts";
import { printDiagnostics, usage, writeAtomic } from "../cli/io.ts";
import type { Format } from "../render/index.ts";
import type { Diagnostic, Skin, ThemeName } from "../types.ts";
import { renderDocx } from "./docx.ts";
import { type DocFigure, isError, renderFigure } from "./figures.ts";
import { renderDocHtml } from "./html.ts";
import { wordImage } from "./images.ts";
import { type Inline, inline, plain } from "./inline.ts";
import {
  type Align,
  type Block,
  type ListItem,
  type Marker,
  type ParsedDoc,
  parseDoc,
} from "./markdown.ts";
import { renderDocMarkdown } from "./md.ts";

export {
  type Align,
  type Block,
  type DocFigure,
  type Inline,
  inline,
  type ListItem,
  type Marker,
  type ParsedDoc,
  parseDoc,
  plain,
};

export const DOC_FORMATS = ["html", "md", "docx"] as const;
export type DocFormat = (typeof DOC_FORMATS)[number];

export interface DocRequest {
  /** The Markdown file. */
  file: string;
  /** Output path without extension; each format adds its own. */
  base: string;
  formats: DocFormat[];
  /** Light unless asked: documents are mostly read on white pages or printed. */
  theme?: ThemeName;
  /** Overrides each spec's own skin. */
  skin?: Skin;
}

export interface DocOutput {
  path: string;
  format: DocFormat;
  bytes: number;
  figures: number;
}

export interface DocResult {
  outputs: DocOutput[];
  /** Figure files written next to the Markdown output. */
  files: string[];
  diagnostics: Diagnostic[];
  /** Marker comments found outside code. */
  markers: number;
}

/** One document build: the source, its parse, and the diagnostics every step adds to. */
interface Build {
  req: DocRequest;
  text: string;
  doc: ParsedDoc;
  dir: string;
  theme: ThemeName;
  diagnostics: Diagnostic[];
}

/** A file built in memory; figure files have no format. */
interface Pending {
  path: string;
  data: string | Uint8Array;
  format?: DocFormat;
  figures: number;
}

/** Every marker's figure, rendered in the formats the asked-for outputs embed. */
async function renderFigures(b: Build): Promise<Map<number, DocFigure>> {
  const want = new Set(b.req.formats);
  const formats: Format[] = [];
  if (want.has("html") || want.has("md")) formats.push("svg");
  if (want.has("md") || want.has("docx")) formats.push("png");
  const figures = new Map<number, DocFigure>();
  for (const m of b.doc.markers) {
    const f = await renderFigure(
      m,
      b.dir,
      { formats, theme: b.theme, skin: b.req.skin },
      b.diagnostics,
    );
    if (f) figures.set(m.n, f);
  }
  return figures;
}

/** Each asked-for format in memory, with the figure files the Markdown output links to. */
function buildOutputs(b: Build, figures: Map<number, DocFigure>): Pending[] {
  const { req, text, doc, dir, theme } = b;
  const want = new Set(req.formats);
  const title = doc.title ?? basename(req.file).replace(/\.(md|markdown)$/i, "");
  const pending: Pending[] = [];
  if (want.has("html")) {
    const html = renderDocHtml({ ...doc, title }, figures, theme, dir);
    const count = html.match(/<figure class="orrery"/g)?.length ?? 0;
    pending.push({ path: `${req.base}.html`, data: html, format: "html", figures: count });
  }
  if (want.has("md")) {
    const md = renderDocMarkdown(text, doc, figures);
    const out = dirname(`${req.base}.md`);
    for (const [rel, data] of md.files) pending.push({ path: join(out, rel), data, figures: 0 });
    pending.push({ path: `${req.base}.md`, data: md.text, format: "md", figures: md.figures });
  }
  if (want.has("docx")) {
    const docx = renderDocx({
      title,
      blocks: doc.blocks,
      figures,
      image: (src) => wordImage(src, dir, b.diagnostics),
    });
    pending.push({
      path: `${req.base}.docx`,
      data: docx.data,
      format: "docx",
      figures: docx.figures,
    });
  }
  return pending;
}

/** DG402 for every output that holds fewer figures than the document has markers. */
function checkFigureCounts(b: Build, pending: Pending[]): void {
  const { doc } = b;
  const taken = new Set(doc.markers.map((m) => m.line + 1));
  const stray = doc.markerLines.filter((l) => !taken.has(l));
  for (const p of pending) {
    if (!p.format || p.figures === doc.markerLines.length) continue;
    b.diagnostics.push({
      severity: "error",
      code: "DG402",
      message: `the ${p.format} output has ${p.figures} figure(s) for ${doc.markerLines.length} marker(s)${stray.length ? `; the marker on line ${stray.join(", ")} is not on a line of its own at the top level` : ""}`,
      subject: { format: p.format },
      evidence: { figures: p.figures, markers: doc.markerLines.length, lines: stray },
      fixes: [
        "put each <!-- orrery: spec.yaml | Caption --> marker on a line of its own, outside lists, quotes and code",
      ],
    });
  }
}

/** Renders every figure, builds each format in memory, and writes nothing unless all are whole. */
export async function buildDoc(req: DocRequest): Promise<DocResult> {
  const text = readFileSync(req.file, "utf8");
  const doc = parseDoc(text);
  const diagnostics: Diagnostic[] = [];
  const b: Build = {
    req,
    text,
    doc,
    dir: dirname(req.file),
    theme: req.theme ?? "light",
    diagnostics,
  };
  const result: DocResult = {
    outputs: [],
    files: [],
    diagnostics,
    markers: doc.markerLines.length,
  };
  const figures = await renderFigures(b);
  if (diagnostics.some(isError)) return result;
  const pending = buildOutputs(b, figures);
  checkFigureCounts(b, pending);
  if (diagnostics.some(isError)) return result;
  for (const p of pending) {
    writeAtomic(p.path, p.data);
    const bytes = typeof p.data === "string" ? Buffer.byteLength(p.data) : p.data.length;
    if (p.format)
      result.outputs.push({ path: p.path, format: p.format, bytes, figures: p.figures });
    else result.files.push(p.path);
  }
  return result;
}

const samePath = (a: string, b: string) =>
  process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;

export async function cmdDoc(args: Args): Promise<void> {
  const [docPath] = args._;
  if (!docPath) usage("doc needs a Markdown file");
  const file = resolve(docPath);
  if (!existsSync(file) || !statSync(file).isFile()) usage(`no such file: ${docPath}`);
  const theme = String(args.flags.theme ?? "light");
  if (theme !== "light" && theme !== "dark") usage("--theme must be light or dark");
  const outFlag = typeof args.flags.out === "string" ? args.flags.out : undefined;
  const fmtFlag = typeof args.flags.format === "string" ? args.flags.format : undefined;
  const outExt = outFlag ? extname(outFlag).slice(1).toLowerCase() : "";
  const known = (f: string): f is DocFormat => (DOC_FORMATS as readonly string[]).includes(f);
  let formats: DocFormat[];
  if (fmtFlag) {
    const list = fmtFlag === "all" ? [...DOC_FORMATS] : fmtFlag.split(",").map((f) => f.trim());
    for (const f of list)
      if (!known(f)) usage(`unknown format "${f}" (use ${DOC_FORMATS.join(", ")} or all)`);
    formats = list as DocFormat[];
  } else formats = known(outExt) ? [outExt] : ["html"];
  const name = basename(file).replace(/\.(md|markdown)$/i, "");
  let base: string;
  if (!outFlag) base = join(dirname(file), name);
  else if (
    outFlag.endsWith("/") ||
    outFlag.endsWith("\\") ||
    (existsSync(outFlag) && statSync(outFlag).isDirectory())
  )
    base = join(resolve(outFlag), name);
  else base = resolve(known(outExt) ? outFlag.slice(0, -(outExt.length + 1)) : outFlag);
  if (formats.includes("md") && samePath(resolve(`${base}.md`), file))
    usage(`the md output would overwrite ${docPath}; pass -o, e.g. -o dist/${name}.md`);

  const result = await buildDoc({
    file,
    base,
    formats,
    theme,
    skin: args.flags.skin as Skin | undefined,
  });
  printDiagnostics(result.diagnostics, false);
  for (const o of result.outputs)
    process.stdout.write(`wrote ${o.path} (${o.bytes} bytes, ${o.figures} figure(s))\n`);
  if (result.files.length)
    process.stdout.write(
      `wrote ${result.files.length} figure file(s) to ${dirname(result.files[0] ?? "")}\n`,
    );
  const errors = result.diagnostics.filter(isError).length;
  const warnings = result.diagnostics.length - errors;
  process.stdout.write(
    `${errors ? "failed" : "ok"}: ${result.markers} marker(s), ${errors} error(s), ${warnings} warning(s)\n`,
  );
  process.exitCode = errors ? 1 : 0;
}
