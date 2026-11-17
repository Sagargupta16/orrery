// Markdown images that name local files: data URIs in the HTML page, PNGs in the Word file.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import type { Diagnostic } from "../types.ts";
import { type DocxImage, pngImage } from "./docx.ts";
import type { Inline } from "./inline.ts";
import type { Block } from "./markdown.ts";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

/** Whether an existing `path` is inside `dir` once links are followed. */
export function withinDir(path: string, dir: string): boolean {
  const rel = relative(realpathSync(dir), realpathSync(path));
  return !!rel && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

const roots = new Map<string, string>();

/**
 * The folder a document may read specs and images from: the git repository that holds it (so
 * docs/design.md can show ../diagrams/x.yaml), else the document's own folder. `orrery verify`
 * bounds evidence the same way.
 */
export function docRoot(dir: string): string {
  const known = roots.get(dir);
  if (known) return known;
  let root = dir;
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (top) root = top;
  } catch {
    // Not a git checkout, or no git: the document's own folder.
  }
  roots.set(dir, root);
  return root;
}

/** A warning once per image and code, though html and docx both ask. */
function warn(diagnostics: Diagnostic[], d: Diagnostic): void {
  const image = d.subject?.image;
  if (!diagnostics.some((o) => o.code === d.code && o.subject?.image === image))
    diagnostics.push(d);
}

/**
 * A Markdown image path as a local file, when it is one. A missing file is a DG404 warning, and
 * one to embed from outside the document's repository (docRoot) a DG403 warning: a document
 * embeds only its own project's files.
 */
function localFile(
  src: string,
  dir: string,
  diagnostics: Diagnostic[],
  embed = true,
): string | undefined {
  if (!src || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(src)) return undefined;
  // The query and fragment are not part of the file name, and %20 is a space in it.
  let name = src.split(/[?#]/)[0] ?? "";
  try {
    name = decodeURIComponent(name);
  } catch {
    // A lone % stays part of the name.
  }
  const path = resolve(dir, name);
  if (!existsSync(path) || !statSync(path).isFile()) {
    warn(diagnostics, {
      severity: "warning",
      code: "DG404",
      message: `image ${src} not found`,
      subject: { image: src },
      fixes: ["write the image path relative to the document's folder"],
    });
    return undefined;
  }
  if (!embed || withinDir(path, docRoot(dir))) return path;
  warn(diagnostics, {
    severity: "warning",
    code: "DG403",
    message: `image ${src} is outside the document's repository, so it is not embedded`,
    subject: { image: src },
    fixes: ["copy the image into the repository that holds the document"],
  });
  return undefined;
}

/** An image's src in the HTML page: a local file becomes a data URI, so the page stands alone. */
export function dataUri(src: string, dir: string, diagnostics: Diagnostic[] = []): string {
  const file = localFile(src, dir, diagnostics);
  const mime = file && MIME[extname(file).toLowerCase()];
  return file && mime ? `data:${mime};base64,${readFileSync(file).toString("base64")}` : src;
}

/** A local image as a PNG for the Word file; one in another format is a warning and its alt text. */
export function wordImage(
  src: string,
  dir: string,
  diagnostics: Diagnostic[],
): DocxImage | undefined {
  const file = localFile(src, dir, diagnostics);
  const img = file ? pngImage(readFileSync(file)) : undefined;
  if (file && !img)
    warn(diagnostics, {
      severity: "warning",
      code: "DG403",
      message: `image ${src} is not a PNG; the Word file shows its alt text instead`,
      subject: { image: src },
      fixes: ["save the image as PNG, or link it instead of embedding it"],
    });
  return img;
}

/** Every image path in the blocks, in document order. */
function imagesOf(blocks: Block[]): string[] {
  const out: string[] = [];
  const walk = (list: Inline[]) => {
    for (const n of list)
      if (n.t === "img") out.push(n.src);
      else if ("c" in n) walk(n.c);
  };
  for (const b of blocks) {
    if (b.t === "heading" || b.t === "para") walk(b.c);
    else if (b.t === "list")
      for (const it of b.items) {
        walk(it.c);
        out.push(...imagesOf(it.more ?? []));
      }
    else if (b.t === "table") for (const row of [b.head, ...b.rows]) for (const c of row) walk(c);
    else if (b.t === "quote") out.push(...imagesOf(b.c));
  }
  return out;
}

/** DG404 for each local image the Markdown output links to that does not exist. */
export function checkImages(blocks: Block[], dir: string, diagnostics: Diagnostic[]): void {
  for (const src of imagesOf(blocks)) localFile(src, dir, diagnostics, false);
}
