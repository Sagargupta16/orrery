// Renders each figure marker's spec to the SVG and PNG the document formats embed.
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { renderFailure } from "../cli/io.ts";
import { type Format, renderModel } from "../render/index.ts";
import { parseSpec } from "../spec/index.ts";
import type { Diagnostic, Skin, ThemeName } from "../types.ts";
import type { Marker } from "./markdown.ts";

export interface DocFigure {
  n: number;
  caption: string;
  /** File-safe spec name: figures/01-<stem>.svg. */
  stem: string;
  svg?: string;
  /** PNG at 2x. */
  png?: Uint8Array;
  /** Scene size in CSS px. */
  width: number;
  height: number;
}

export const isError = (d: Diagnostic) => d.severity === "error";

export async function renderFigure(
  m: Marker,
  dir: string,
  opts: { formats: Format[]; theme: ThemeName; skin?: Skin },
  diagnostics: Diagnostic[],
): Promise<DocFigure | undefined> {
  const tag = (d: Diagnostic): Diagnostic => ({
    ...d,
    message: `figure ${m.n} (${m.spec}): ${d.message}`,
    subject: { ...d.subject, figure: m.n, line: m.line + 1 },
  });
  const path = resolve(dir, m.spec);
  if (!m.spec || !existsSync(path) || !statSync(path).isFile()) {
    diagnostics.push({
      severity: "error",
      code: "DG401",
      message: m.spec
        ? `figure ${m.n}: no such spec file ${m.spec}`
        : `figure ${m.n}: the marker names no spec file`,
      subject: { figure: m.n, line: m.line + 1, spec: m.spec },
      fixes: [
        "write the path relative to the document's folder: <!-- orrery: diagrams/system.yaml | Caption -->",
      ],
    });
    return undefined;
  }
  const parsed = parseSpec(readFileSync(path, "utf8"), path);
  diagnostics.push(...parsed.diagnostics.map(tag));
  if (!parsed.model || parsed.diagnostics.some(isError)) return undefined;
  const name = basename(path).replace(/\.(ya?ml|json)$/i, "");
  let result: Awaited<ReturnType<typeof renderModel>>;
  try {
    // The figure number in the name keeps SVG ids apart when one page holds every figure.
    result = await renderModel({
      model: parsed.model,
      formats: opts.formats,
      themes: [opts.theme],
      name: `fig${m.n}-${name}`,
      scale: 2,
      skin: opts.skin,
    });
  } catch (e) {
    const failure = renderFailure(e);
    if (!failure) throw e;
    diagnostics.push(tag(failure));
    return undefined;
  }
  diagnostics.push(...result.diagnostics.map(tag));
  if (result.diagnostics.some(isError)) return undefined;
  const scene = result.scenes[opts.theme];
  const svg = result.artifacts.find((a) => a.format === "svg")?.data;
  const png = result.artifacts.find((a) => a.format === "png")?.data;
  return {
    n: m.n,
    caption: m.caption ?? parsed.model.title ?? name,
    stem: name.replace(/[^A-Za-z0-9._-]+/g, "-"),
    svg: typeof svg === "string" ? svg : undefined,
    png: png instanceof Uint8Array ? png : undefined,
    width: scene?.width ?? 1,
    height: scene?.height ?? 1,
  };
}
