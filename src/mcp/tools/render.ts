// render: every output format, written to out_dir (stdio only) or returned in the result.
import { isAbsolute, join } from "node:path";
import { writeAtomic } from "../../cli.ts";
import { FORMATS, type Format } from "../../render/index.ts";
import { ANIMATE_MODES, SKINS, THEMES, type ThemeName } from "../../types.ts";
import {
  type Content,
  errors,
  json,
  num,
  oneOf,
  parse,
  png,
  renderSafe,
  SKIN,
  SPEC_PROPS,
  specInput,
  stats,
  str,
  type Tool,
  ToolError,
  text,
  verdict,
} from "../kit.ts";

export const renderTool: Tool = {
  name: "render",
  title: "Render a diagram",
  description:
    "Render a spec to SVG, PNG, draw.io, editable draw.io SVG, a React TSX component or a standalone HTML page. Nothing renders while the spec has errors (see the diagnostics). " +
    "With out_dir (stdio only) the files are written there and their paths returned; otherwise the result carries a JSON receipt, then each output in order: PNGs as images, the others as text.",
  inputSchema: {
    type: "object",
    properties: {
      ...SPEC_PROPS,
      formats: {
        type: "array",
        items: { type: "string", enum: [...FORMATS] },
        description: "Default: svg and png.",
      },
      theme: {
        type: "string",
        enum: [...THEMES, "both"],
        description: "both renders a light and a dark file. Default: the spec's theme.",
      },
      skin: SKIN,
      animate: {
        type: "string",
        enum: [...ANIMATE_MODES],
        description:
          "SVG motion: packets, flow, relay or none. Default: the skin's (packets for classic, relay for stage). PNG is always still.",
      },
      scale: {
        type: "number",
        minimum: 0.1,
        maximum: 8,
        description: "PNG pixels per diagram unit. Default 3 with out_dir, 2 inline.",
      },
      out_dir: {
        type: "string",
        description:
          "Absolute folder to write the files to (stdio only). Existing files are replaced.",
      },
    },
    additionalProperties: false,
  },
  async run(input, ctx) {
    const spec = specInput(input, ctx);
    const raw = input.formats;
    const formats: Format[] =
      raw === undefined || raw === null
        ? ["svg", "png"]
        : raw === "all"
          ? [...FORMATS]
          : (formatList(raw) as Format[]);
    const themeArg = oneOf(input, "theme", [...THEMES, "both"] as const);
    const skin = oneOf(input, "skin", SKINS);
    const animate = oneOf(input, "animate", ANIMATE_MODES);
    const outDir = str(input, "out_dir");
    if (outDir !== undefined && ctx.http)
      throw new ToolError(
        "out_dir is refused over HTTP: leave it out and the outputs come back in the result",
      );
    if (outDir !== undefined && !isAbsolute(outDir))
      throw new ToolError(`out_dir must be an absolute path (got ${outDir})`);
    const scale = num(input, "scale", 0.1, 8) ?? (outDir ? 3 : 2);
    const parsed = parse(spec, ctx);
    const diagnostics = [...parsed.diagnostics];
    const model = parsed.model;
    if (!model || errors(diagnostics)) return [json(verdict(diagnostics, { outputs: [] }))];
    const theme = themeArg ?? model.theme;
    const themes: ThemeName[] = theme === "both" ? ["light", "dark"] : [theme];
    const r = await renderSafe({
      model,
      formats,
      themes,
      name: spec.name,
      scale,
      animate,
      skin,
    });
    diagnostics.push(...r.diagnostics);
    const content: Content[] = [];
    const outputs = r.artifacts.map((a) => {
      const file = `${spec.name}${themes.length > 1 && a.format !== "html" ? `-${a.theme}` : ""}.${a.format}`;
      const bytes = typeof a.data === "string" ? Buffer.byteLength(a.data) : a.data.length;
      const meta = {
        format: a.format,
        theme: a.format === "html" ? "light+dark" : a.theme,
        bytes,
        width: a.width,
        height: a.height,
      };
      if (outDir) {
        const path = join(outDir, file);
        writeAtomic(path, a.data);
        return { path, ...meta };
      }
      content.push(typeof a.data === "string" ? text(a.data) : png(a.data));
      // Index in the result's content list, after this receipt.
      return { file, content: content.length, ...meta };
    });
    const scene = r.scenes[themes[0] ?? model.theme];
    return [json(verdict(diagnostics, { stats: stats(model, scene), outputs })), ...content];
  },
};

function formatList(v: unknown): string[] {
  const items = typeof v === "string" ? v.split(",").map((s) => s.trim()) : v;
  if (
    !Array.isArray(items) ||
    !items.length ||
    items.some((i) => typeof i !== "string" || !FORMATS.includes(i as Format))
  )
    throw new ToolError(`formats must be a list of ${FORMATS.join(", ")}`);
  return [...new Set(items as string[])];
}
