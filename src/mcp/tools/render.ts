// render: every output format, written to out_dir (stdio only) or returned in the result.
import { isAbsolute, join } from "node:path";
import { writeAtomic } from "../../cli/io.ts";
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
import { VIEWER_LINK, viewerMeta } from "../viewer.ts";

/** Most clients refuse a single message past about 10 MB: stay under it with room for the receipt. */
const MAX_INLINE = 8 * 1024 * 1024;

const MIME: Partial<Record<Format, string>> = {
  svg: "image/svg+xml",
  "drawio.svg": "image/svg+xml",
  "sequence.svg": "image/svg+xml",
  html: "text/html",
  drawio: "application/vnd.jgraph.mxfile",
  tsx: "text/typescript-jsx",
  mmd: "text/vnd.mermaid",
};

export const renderTool: Tool = {
  name: "render",
  title: "Render a diagram",
  description:
    "Render a spec to SVG, PNG, draw.io, editable draw.io SVG, a React TSX component or a standalone HTML page. Nothing renders while the spec has errors (see the diagnostics). " +
    "With out_dir (stdio only) the files are written there and their paths returned; otherwise the result carries a JSON receipt, then each output in order: PNGs as images, the others as text (as resources meant for the user, not the model, on clients that speak 2026-07-28). " +
    "Inline results are capped at 8 MB in all.",
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
  _meta: VIEWER_LINK,
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
      source: spec.text,
    });
    diagnostics.push(...r.diagnostics);
    if (!outDir) {
      // Base64 is a third larger than the PNG it carries.
      const size = (d: string | Uint8Array) =>
        typeof d === "string" ? Buffer.byteLength(d) : Math.ceil(d.length / 3) * 4;
      const inline = r.artifacts.reduce((n, a) => n + size(a.data), 0);
      if (inline > MAX_INLINE)
        throw new ToolError(
          `the outputs total ${(inline / 1024 / 1024).toFixed(1)} MB, over the ${MAX_INLINE / 1024 / 1024} MB a result can carry: ` +
            "write them with out_dir (stdio only), ask for fewer formats, one theme or a lower scale",
        );
    }
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
      content.push(inlined(a.data, file, ctx.modern ? MIME[a.format] : undefined));
      // Index in the result's content list, after this receipt.
      return { file, content: content.length, ...meta };
    });
    const scene = r.scenes[themes[0] ?? model.theme];
    const result = [
      json(verdict(diagnostics, { stats: stats(model, scene), outputs })),
      ...content,
    ];
    const view =
      ctx.ui && r.artifacts.length
        ? await viewerMeta({
            model,
            name: spec.name,
            theme: themes[0] ?? model.theme,
            animate,
            skin,
            have: r.artifacts,
          })
        : undefined;
    return view ? { content: result, _meta: view } : result;
  },
};

/**
 * A PNG is an image; any other output is text for older clients, which show it to the model. A
 * 2026-07-28 client gets an embedded resource annotated for the user, so the diagram's markup
 * reaches the person without filling the model's context (the receipt already says what it is).
 */
function inlined(data: string | Uint8Array, file: string, mimeType: string | undefined): Content {
  if (typeof data !== "string") return png(data);
  if (!mimeType) return text(data);
  return {
    type: "resource",
    resource: { uri: `orrery://render/${file}`, mimeType, text: data },
    annotations: { audience: ["user"] },
  };
}

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
