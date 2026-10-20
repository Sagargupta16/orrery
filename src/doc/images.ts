// Markdown images that name local files: data URIs in the HTML page, PNGs in the Word file.
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import type { Diagnostic } from "../types.ts";
import { type DocxImage, pngImage } from "./docx.ts";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

/** A Markdown image path as a file in the document's folder, when it is one. */
function localFile(src: string, dir: string): string | undefined {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(src)) return undefined;
  const path = resolve(dir, src);
  return existsSync(path) && statSync(path).isFile() ? path : undefined;
}

/** An image's src in the HTML page: a local file becomes a data URI, so the page stands alone. */
export function dataUri(src: string, dir: string): string {
  const file = localFile(src, dir);
  const mime = file && MIME[extname(file).toLowerCase()];
  return file && mime ? `data:${mime};base64,${readFileSync(file).toString("base64")}` : src;
}

/** A local image as a PNG for the Word file; one in another format is a warning and its alt text. */
export function wordImage(
  src: string,
  dir: string,
  diagnostics: Diagnostic[],
): DocxImage | undefined {
  const file = localFile(src, dir);
  const img = file ? pngImage(readFileSync(file)) : undefined;
  if (file && !img)
    diagnostics.push({
      severity: "warning",
      code: "DG403",
      message: `image ${src} is not a PNG; the Word file shows its alt text instead`,
      subject: { image: src },
      fixes: ["save the image as PNG, or link it instead of embedding it"],
    });
  return img;
}
