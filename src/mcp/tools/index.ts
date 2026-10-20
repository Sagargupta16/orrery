// The nine tools in the order tools/list returns them.
import type { Tool } from "../kit.ts";
import { drawioLinkTool } from "./drawio.ts";
import { authoringGuideTool } from "./guide.ts";
import { iconsSearchTool } from "./icons.ts";
import { tryPatchesTool } from "./patches.ts";
import { renderTool } from "./render.ts";
import { reviewTool } from "./review.ts";
import { getTemplateTool, listTemplatesTool } from "./templates.ts";
import { validateTool } from "./validate.ts";

export const TOOLS: Tool[] = [
  authoringGuideTool,
  validateTool,
  renderTool,
  reviewTool,
  iconsSearchTool,
  listTemplatesTool,
  getTemplateTool,
  tryPatchesTool,
  drawioLinkTool,
];
