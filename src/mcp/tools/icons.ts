// icons_search: icon ids for a spec's icon: field, ranked best first.
import { PACK_ORDER, searchIcons } from "../../icons/index.ts";
import { json, num, oneOf, str, type Tool, ToolError } from "../kit.ts";

const ICON_TYPES = ["service", "resource", "group", "category", "logo", "glyph"];

export const iconsSearchTool: Tool = {
  name: "icons_search",
  title: "Search icons",
  description:
    "Find icon ids for a spec's icon: field across the official AWS, Azure, Google Cloud, Kubernetes, GitHub and IBM packs, 5,500 tech logos and the generic symbol sets, ranked best first. Returns JSON: id, name, category, type.",
  inputSchema: {
    type: "object",
    properties: {
      words: {
        type: "string",
        description: "What to draw, for example 'load balancer' or 'redis'.",
      },
      pack: { type: "string", enum: [...PACK_ORDER], description: "Only this pack." },
      type: { type: "string", enum: ICON_TYPES, description: "Only this kind of icon." },
      limit: { type: "integer", minimum: 1, maximum: 50, description: "Default 15." },
    },
    required: ["words"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
  async run(input) {
    const words = str(input, "words")?.trim();
    if (!words) throw new ToolError("words is required, for example 'load balancer'");
    const results = searchIcons(words, {
      pack: oneOf(input, "pack", PACK_ORDER),
      type: oneOf(input, "type", ICON_TYPES),
      limit: num(input, "limit", 1, 50, true) ?? 15,
    });
    return [json(results)];
  },
};
