// list_templates and get_template: the bundled example specs to start a diagram from.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { examplesDir } from "../../paths.ts";
import { parseSpec } from "../../spec.ts";
import { json, str, type Tool, ToolError, text } from "../kit.ts";

function templates(): string[] {
  if (!existsSync(examplesDir)) return [];
  return readdirSync(examplesDir)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => f.replace(/\.ya?ml$/, ""))
    .sort();
}

const field = (yaml: string, key: string) =>
  yaml
    .match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]
    ?.trim()
    .replace(/^(["'])(.*)\1$/, "$2");

export const listTemplatesTool: Tool = {
  name: "list_templates",
  title: "List templates",
  description:
    "The bundled reference diagrams (AWS, Azure, Google Cloud, Kubernetes, C4, system design, flowcharts, BPMN, state machines, journeys), each with its title. Start from the closest one with get_template.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, idempotentHint: true },
  async run() {
    return [
      json(
        templates().map((name) => {
          const yaml = readFileSync(join(examplesDir, `${name}.yaml`), "utf8");
          return { name, title: field(yaml, "title"), subtitle: field(yaml, "subtitle") };
        }),
      ),
    ];
  },
};

export const getTemplateTool: Tool = {
  name: "get_template",
  title: "Get a template",
  description:
    "One bundled template's spec YAML (names from list_templates; starter is the general one). Edit it and pass it to validate, render or review as spec.",
  inputSchema: {
    type: "object",
    properties: { name: { type: "string", description: "A name from list_templates." } },
    required: ["name"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
  async run(input, ctx) {
    const name = str(input, "name");
    const list = templates();
    if (!name || !list.includes(name))
      throw new ToolError(`no template "${name ?? ""}"; templates: ${list.join(", ")}`);
    const file = join(examplesDir, `${name}.yaml`);
    const yaml = readFileSync(file, "utf8");
    const icons = parseSpec(yaml, file).model?.icons ?? [];
    if (!icons.length) return [text(yaml)];
    const files = icons.map((i) => relative(examplesDir, i.path).replaceAll("\\", "/"));
    return [
      text(yaml),
      text(
        `This template draws local icons from SVG files beside it (${files.join(", ")}). ` +
          (ctx.http
            ? "Over HTTP, swap them for icon ids from icons_search before rendering."
            : `To render it as is, pass spec_path ${file}.`),
      ),
    ];
  },
};
