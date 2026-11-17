// Renders each figure, from a marker's spec file or an `orrery` fence's own spec, to the SVG and
// PNG the document formats embed.
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { renderFailure } from "../cli/io.ts";
import { type Format, renderModel } from "../render/index.ts";
import { parseSpec } from "../spec/index.ts";
import type { Diagnostic, Skin, ThemeName } from "../types.ts";
import { docRoot, withinDir } from "./images.ts";
import type { Marker } from "./markdown.ts";

export interface DocFigure {
  n: number;
  caption: string;
  /** The caption the marker or fence gave, else the diagram's own description. */
  alt: string;
  /** File-safe spec name: figures/01-<stem>.svg. */
  stem: string;
  svg?: string;
  /** PNG at 2x. */
  png?: Uint8Array;
  /** Both SVGs, when an `orrery` fence asks for theme=both: the page picks by color scheme. */
  both?: { light: string; dark: string };
  /** Scene size in CSS px. */
  width: number;
  height: number;
}

export const isError = (d: Diagnostic) => d.severity === "error";

const FENCE_KEYS = ["name", "caption", "theme"];
const FENCE_THEMES = ["light", "dark", "both"];

/** DG405 for each key of an `orrery` fence's info string that is unknown or has a bad value. */
function fenceProblems(m: Marker): Diagnostic[] {
  const keys = m.fence?.keys ?? {};
  const out: Diagnostic[] = [];
  const problem = (message: string) =>
    out.push({
      severity: "error",
      code: "DG405",
      message: `figure ${m.n}: ${message}`,
      subject: { figure: m.n, line: m.line + 1 },
      fixes: ['open the fence as ```orrery name=checkout caption="The checkout path" theme=both'],
    });
  for (const k of Object.keys(keys))
    if (!FENCE_KEYS.includes(k))
      problem(`the orrery fence has an unknown key "${k}"; it takes name=, caption= and theme=`);
  const theme = keys.theme;
  if (theme !== undefined && !FENCE_THEMES.includes(theme))
    problem(`theme=${theme} is not light, dark or both`);
  return out;
}

/** The spec text and the path it resolves includes and icons against, or a DG401 diagnostic. */
function specOf(m: Marker, dir: string): { text: string; path: string } | Diagnostic {
  const name = m.spec.replace(/[^A-Za-z0-9._-]+/g, "-");
  // A fence's spec lives in the document, so its relative paths start in the document's folder.
  if (m.fence) return { text: m.fence.source, path: join(dir, `${name}.yaml`) };
  const path = resolve(dir, m.spec);
  const found = !!m.spec && existsSync(path) && statSync(path).isFile();
  if (found && withinDir(path, docRoot(dir))) return { text: readFileSync(path, "utf8"), path };
  let message = `figure ${m.n}: the marker names no spec file`;
  if (found) message = `figure ${m.n}: spec ${m.spec} is outside the document's repository`;
  else if (m.spec) message = `figure ${m.n}: no such spec file ${m.spec}`;
  return {
    severity: "error",
    code: "DG401",
    message,
    subject: { figure: m.n, line: m.line + 1, spec: m.spec },
    fixes: [
      "write the path relative to the document's folder, inside its repository: <!-- orrery: diagrams/system.yaml | Caption -->",
    ],
  };
}

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
  const problems = fenceProblems(m);
  diagnostics.push(...problems);
  const spec = specOf(m, dir);
  if ("severity" in spec) diagnostics.push(spec);
  if (problems.length || "severity" in spec) return undefined;
  const { text, path } = spec;
  const parsed = parseSpec(text, path);
  diagnostics.push(...parsed.diagnostics.map(tag));
  if (!parsed.model || parsed.diagnostics.some(isError)) return undefined;
  const name = m.fence ? m.spec : basename(path).replace(/\.(ya?ml|json)$/i, "");
  // theme=both renders the document's theme first, so Word and the PNG use it.
  const asked = m.fence?.keys.theme as ThemeName | "both" | undefined;
  const other: ThemeName = opts.theme === "light" ? "dark" : "light";
  const themes: ThemeName[] = asked === "both" ? [opts.theme, other] : [asked ?? opts.theme];
  const first = themes[0] ?? opts.theme;
  let result: Awaited<ReturnType<typeof renderModel>>;
  try {
    // The figure number in the name keeps SVG ids apart when one page holds every figure.
    result = await renderModel({
      model: parsed.model,
      formats: opts.formats,
      themes,
      name: `fig${m.n}-${name}`,
      scale: 2,
      skin: opts.skin,
      // Figures carry their spec, so one picked out of the document reopens as its source.
      source: text,
    });
  } catch (e) {
    const failure = renderFailure(e);
    if (!failure) throw e;
    diagnostics.push(tag(failure));
    return undefined;
  }
  diagnostics.push(...result.diagnostics.map(tag));
  if (result.diagnostics.some(isError)) return undefined;
  const scene = result.scenes[first];
  const artifact = (format: Format, theme: ThemeName) =>
    result.artifacts.find((a) => a.format === format && (a.theme ?? first) === theme)?.data;
  const svg = artifact("svg", first);
  const png = artifact("png", first);
  const light = artifact("svg", "light");
  const dark = artifact("svg", "dark");
  const caption = m.caption ?? parsed.model.title ?? name;
  return {
    n: m.n,
    caption,
    alt: m.caption ?? scene?.description ?? caption,
    stem: name.replace(/[^A-Za-z0-9._-]+/g, "-"),
    svg: typeof svg === "string" ? svg : undefined,
    png: png instanceof Uint8Array ? png : undefined,
    both:
      asked === "both" && typeof light === "string" && typeof dark === "string"
        ? { light, dark }
        : undefined,
    width: scene?.width ?? 1,
    height: scene?.height ?? 1,
  };
}
