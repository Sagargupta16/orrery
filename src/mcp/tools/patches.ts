// try_patches: candidate fix sets reviewed on copies of the spec, kept only when they improve it.
import { renderFailure } from "../../cli/io.ts";
import { tryCandidates } from "../../patch/candidates.ts";
import { PatchError, type PatchOp } from "../../patch/types.ts";
import { DEFAULT_REVIEW_WIDTH } from "../../review/index.ts";
import { SKINS, THEMES } from "../../types.ts";
import {
  isObj,
  json,
  num,
  oneOf,
  parse,
  SKIN,
  SPEC_PROPS,
  specInput,
  THEME,
  type Tool,
  ToolError,
  text,
  verdict,
} from "../kit.ts";

const MAX_CANDIDATES = 12;
const PATCH_OPS = ["set", "unset", "add", "move", "edge"];

export const tryPatchesTool: Tool = {
  name: "try_patches",
  title: "Try spec patches",
  description:
    "Review each candidate (a list of patch ops) on its own copy of the spec and keep only those that raise the score without raising any hard count or adding a blocker or major finding. " +
    "Ops: {op: set, path, value}, {op: unset, path}, {op: add, path, value}, {op: move, path, after|before}, {op: edge, match: a spec edge line or null to append, value: the new line or null to remove}; paths are dotted, for example nodes.db.note. " +
    "Returns each candidate's score and verdict, then the best patched spec text when one was kept.",
  inputSchema: {
    type: "object",
    properties: {
      ...SPEC_PROPS,
      candidates: {
        type: "array",
        minItems: 1,
        maxItems: MAX_CANDIDATES,
        description: "Candidate fixes, each a list of patch ops applied in order.",
        items: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              op: { type: "string", enum: PATCH_OPS },
              path: {
                type: "string",
                description: "Dotted spec path, for example nodes.api.label.",
              },
              value: {
                description: "The new value (set, add) or edge line (edge); null removes an edge.",
              },
              after: { type: "string", description: "move: the sibling id to follow." },
              before: { type: "string", description: "move: the sibling id to precede." },
              match: {
                type: ["string", "null"],
                description: "edge: the spec edge line to replace; null appends a new edge.",
              },
            },
            required: ["op"],
          },
        },
      },
      width: {
        type: "integer",
        minimum: 200,
        maximum: 4000,
        description: `Display width in CSS px. Default ${DEFAULT_REVIEW_WIDTH}.`,
      },
      theme: THEME,
      skin: SKIN,
    },
    required: ["candidates"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
  async run(input, ctx) {
    const spec = specInput(input, ctx);
    const candidates = candidatesOf(input.candidates);
    const width = num(input, "width", 200, 4000, true);
    const theme = oneOf(input, "theme", THEMES);
    const skin = oneOf(input, "skin", SKINS);
    const parsed = parse(spec, ctx);
    if (!parsed.model) return [json(verdict(parsed.diagnostics))];
    // A patch can add what parse() refuses over HTTP (icons:), so every patched copy goes through it too.
    const check = (patched: string) => {
      try {
        parse({ ...spec, text: patched }, ctx);
        return undefined;
      } catch (e) {
        if (e instanceof ToolError) return e.message;
        throw e;
      }
    };
    let run: Awaited<ReturnType<typeof tryCandidates>>;
    try {
      run = await tryCandidates({
        source: spec.text,
        filename: spec.path,
        candidates,
        ...(ctx.http ? { check } : {}),
        ...(width ? { width } : {}),
        ...(theme ? { theme } : {}),
        ...(skin ? { skin } : {}),
      });
    } catch (e) {
      if (e instanceof PatchError) throw new ToolError(e.message);
      const failure = renderFailure(e);
      if (!failure) throw e;
      return [json(verdict([...parsed.diagnostics, failure]))];
    }
    const summary = {
      before: { score: run.before.score, pass: run.before.pass },
      results: run.results.map((r) => ({
        index: r.index,
        kept: r.kept,
        score: r.report?.score,
        pass: r.report?.pass,
        reason: r.reason,
      })),
      best: run.best?.index ?? null,
    };
    return [json(summary), ...(run.best?.source ? [text(run.best.source)] : [])];
  },
};

function candidatesOf(v: unknown): PatchOp[][] {
  if (!Array.isArray(v) || !v.length || v.length > MAX_CANDIDATES)
    throw new ToolError(
      `candidates must be a list of 1 to ${MAX_CANDIDATES} candidates, each a list of patch ops`,
    );
  for (const [i, c] of v.entries()) {
    if (!Array.isArray(c) || !c.length)
      throw new ToolError(`candidate ${i} must be a non-empty list of patch ops`);
    for (const op of c)
      if (!isObj(op) || !PATCH_OPS.includes(String(op.op)))
        throw new ToolError(`candidate ${i}: every op needs op: ${PATCH_OPS.join(", ")}`);
  }
  return v as PatchOp[][];
}
