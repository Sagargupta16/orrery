// describe: the laid-out diagram as plain text (or the same as JSON), for a reader who cannot see it.
import { describeData, describeScene } from "../../describe.ts";
import {
  errors,
  json,
  oneOf,
  parse,
  renderSafe,
  SPEC_PROPS,
  specInput,
  type Tool,
  text,
  verdict,
} from "../kit.ts";

const FORMATS = ["text", "json"] as const;

export const describeTool: Tool = {
  name: "describe",
  title: "Describe a diagram",
  description:
    "Lay the spec out and tell what the picture shows in plain text: the title, each group and the nodes in it, each node's place in reading order (row from the top, then from the left) and its edges with their labels, and the numbered steps. " +
    "Use it to check the drawing says what you meant without looking at an image, or as alt text. format json returns the same as data. A spec with errors returns its diagnostics instead.",
  inputSchema: {
    type: "object",
    properties: {
      ...SPEC_PROPS,
      format: { type: "string", enum: [...FORMATS], description: "Default: text." },
    },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
  async run(input, ctx) {
    const spec = specInput(input, ctx);
    const format = oneOf(input, "format", FORMATS) ?? "text";
    const parsed = parse(spec, ctx);
    const diagnostics = [...parsed.diagnostics];
    const model = parsed.model;
    if (!model || errors(diagnostics)) return [json(verdict(diagnostics))];
    const r = await renderSafe({ model, formats: [], themes: [model.theme], name: spec.name });
    const scene = r.scenes[model.theme];
    if (!scene) return [json(verdict([...diagnostics, ...r.diagnostics]))];
    return [
      format === "json" ? json(describeData(scene, model)) : text(describeScene(scene, model)),
    ];
  },
};
