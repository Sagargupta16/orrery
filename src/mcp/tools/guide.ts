// get_authoring_guide: the skill and spec reference, or the review loop, as one text.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { skillRoot } from "../../paths.ts";
import { oneOf, type Tool, text } from "../kit.ts";

export const authoringGuideTool: Tool = {
  name: "get_authoring_guide",
  title: "Authoring guide",
  description:
    "Read this before writing a spec. topic diagram (default) returns the orrery skill (fast path, authoring rules, outputs) and the full spec reference; topic review returns the review loop and the patch ops try_patches takes.",
  inputSchema: {
    type: "object",
    properties: { topic: { type: "string", enum: ["diagram", "review"] } },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
  async run(input) {
    const topic = oneOf(input, "topic", ["diagram", "review"]) ?? "diagram";
    const files =
      topic === "diagram"
        ? ["SKILL.md", join("references", "spec.md")]
        : [join("references", "review", "loop.md")];
    const note =
      "Over MCP the commands this guide names are tools: render, validate, review, icons_search (icons search), list_templates and get_template (init), try_patches (patch) and drawio_link. " +
      "Where it says to run a command, call the tool instead, passing the spec as spec or spec_path. Paths such as references/... are inside the skill folder; get_authoring_guide topic review returns the review loop.";
    const body = files.map(
      (f) => `===== ${f.replaceAll("\\", "/")} =====\n${readFileSync(join(skillRoot, f), "utf8")}`,
    );
    return [text([note, ...body].join("\n\n"))];
  },
};
