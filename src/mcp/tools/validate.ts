// validate: parse and lay out a spec without rendering, and return its diagnostics and size.
import {
  errors,
  json,
  parse,
  renderSafe,
  SPEC_PROPS,
  specInput,
  stats,
  type Tool,
  verdict,
} from "../kit.ts";

export const validateTool: Tool = {
  name: "validate",
  title: "Validate a spec",
  description:
    "Check a spec without rendering: parse errors, unknown icons (with the closest ids), bad references and layout warnings, each with a code, a message and concrete fixes. Returns JSON with ok, the counts, the diagnostics and the diagram's size.",
  inputSchema: { type: "object", properties: SPEC_PROPS, additionalProperties: false },
  annotations: { readOnlyHint: true, idempotentHint: true },
  async run(input, ctx) {
    const spec = specInput(input, ctx);
    const parsed = parse(spec, ctx);
    const diagnostics = [...parsed.diagnostics];
    const model = parsed.model;
    if (!model || errors(diagnostics)) return [json(verdict(diagnostics))];
    const r = await renderSafe({ model, formats: [], themes: [model.theme], name: spec.name });
    diagnostics.push(...r.diagnostics);
    return [json(verdict(diagnostics, { stats: stats(model, r.scenes[model.theme]) }))];
  },
};
