// review: the measured review at a display width, with the PNG the reader sees.
import { renderFailure } from "../../cli.ts";
import { DEFAULT_REVIEW_WIDTH, reviewModel } from "../../review.ts";
import { SKINS, THEMES } from "../../types.ts";
import {
  json,
  num,
  oneOf,
  parse,
  png,
  SKIN,
  SPEC_PROPS,
  specInput,
  THEME,
  type Tool,
  verdict,
} from "../kit.ts";

export const reviewTool: Tool = {
  name: "review",
  title: "Review a diagram",
  description:
    "Measure the diagram at the width readers see it (a README column is 880 px): six scored dimensions (conventions, layout, grid, flow, overlap, quality), hard counts, findings with evidence and spec fixes, and pass (no blocker or major and score >= 85). " +
    "Returns the report JSON and the PNG exactly as the reader sees it. A failing review is a normal result: fix the spec, or try fixes with try_patches.",
  inputSchema: {
    type: "object",
    properties: {
      ...SPEC_PROPS,
      width: {
        type: "integer",
        minimum: 200,
        maximum: 4000,
        description: `Display width in CSS px. Default ${DEFAULT_REVIEW_WIDTH}.`,
      },
      theme: THEME,
      skin: SKIN,
    },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
  async run(input, ctx) {
    const spec = specInput(input, ctx);
    const width = num(input, "width", 200, 4000, true) ?? DEFAULT_REVIEW_WIDTH;
    const theme = oneOf(input, "theme", THEMES);
    const skin = oneOf(input, "skin", SKINS);
    const parsed = parse(spec, ctx);
    const model = parsed.model;
    if (!model) return [json(verdict(parsed.diagnostics))];
    let run: Awaited<ReturnType<typeof reviewModel>>;
    try {
      run = await reviewModel({
        model: skin ? { ...model, skin } : model,
        name: spec.name,
        width,
        theme: theme ?? model.theme,
        diagnostics: parsed.diagnostics,
      });
    } catch (e) {
      const failure = renderFailure(e);
      if (!failure) throw e;
      return [json(verdict([...parsed.diagnostics, failure]))];
    }
    // A run that renders the reader's look as well hands that picture over instead.
    const look = "look" in run && run.look instanceof Uint8Array ? run.look : run.png;
    return [json(run.report), ...(look ? [png(look)] : [])];
  },
};
