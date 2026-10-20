// drawio_link: a diagrams.net link that carries the draw.io file in its fragment.
import { deflateRawSync } from "node:zlib";
import { SKINS, THEMES } from "../../types.ts";
import {
  errors,
  json,
  oneOf,
  parse,
  renderSafe,
  SKIN,
  SPEC_PROPS,
  specInput,
  THEME,
  type Tool,
  ToolError,
  text,
  verdict,
} from "../kit.ts";

/** diagrams.net reads the whole diagram from the link; past this a browser may refuse it. */
const MAX_LINK_XML = 2 * 1024 * 1024;

/** diagrams.net's #create= payload: the URL-encoded XML, raw-deflated and base64, in JSON. */
function diagramsNetLink(xml: string): string {
  const data = deflateRawSync(Buffer.from(encodeURIComponent(xml)), { level: 9 }).toString(
    "base64",
  );
  return `https://app.diagrams.net/#create=${encodeURIComponent(JSON.stringify({ type: "xml", compressed: true, data }))}`;
}

export const drawioLinkTool: Tool = {
  name: "drawio_link",
  title: "Open in diagrams.net",
  description:
    "A link that opens the diagram in diagrams.net, loaded and editable. Nothing is uploaded: the draw.io file travels in the link's fragment, which the browser never sends to a server.",
  inputSchema: {
    type: "object",
    properties: { ...SPEC_PROPS, theme: THEME, skin: SKIN },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
  async run(input, ctx) {
    const spec = specInput(input, ctx);
    const theme = oneOf(input, "theme", THEMES);
    const skin = oneOf(input, "skin", SKINS);
    const parsed = parse(spec, ctx);
    const diagnostics = [...parsed.diagnostics];
    const model = parsed.model;
    if (!model || errors(diagnostics)) return [json(verdict(diagnostics))];
    const r = await renderSafe({
      model,
      formats: ["drawio"],
      themes: [theme ?? model.theme],
      name: spec.name,
      skin,
    });
    const xml = r.artifacts.find((a) => a.format === "drawio")?.data;
    if (typeof xml !== "string") return [json(verdict([...diagnostics, ...r.diagnostics]))];
    if (Buffer.byteLength(xml) > MAX_LINK_XML)
      throw new ToolError(
        "the draw.io file is over 2 MB, too long for a link: render it with formats [drawio] and open the file in draw.io",
      );
    return [text(diagramsNetLink(xml))];
  },
};
