// parseSpec: reads the source, then runs each step in the order its diagnostics are reported.
import { parse as parseYaml } from "yaml";
import type { Diagnostic, Model } from "../types.ts";
import { newContext } from "./context.ts";
import { parseEdges } from "./edges.ts";
import { applyContains, checkAround, checkCycles, checkParents, parseGroups } from "./groups.ts";
import { TOP_KEYS } from "./keys.ts";
import { checkBorders, checkViews, parseTagStyles, parseViews } from "./meta.ts";
import { checkAlign, parseNodes } from "./nodes.ts";
import { parseLegend, parseLocalIcons, parseSettings, parseStages, parseStory } from "./top.ts";
import { isObj, type Obj, type Report, reporter, str, unknownKeys } from "./values.ts";

export interface ParseResult {
  model?: Model;
  diagnostics: Diagnostic[];
}

export function parseSpec(source: string, filename = "diagram.yaml"): ParseResult {
  const diagnostics: Diagnostic[] = [];
  const report = reporter(diagnostics);
  const raw = readSource(source, filename, report.err);
  if (!raw) return { diagnostics };
  const ctx = newContext(raw, filename, diagnostics, report);

  unknownKeys(ctx, raw, TOP_KEYS, {}, "the top level");
  const settings = parseSettings(ctx);
  const legend = parseLegend(ctx);
  parseLocalIcons(ctx);
  parseStages(ctx, settings.kind);

  parseGroups(ctx);
  parseNodes(ctx, settings);
  checkAlign(ctx);
  applyContains(ctx);
  checkAround(ctx);
  checkParents(ctx);
  checkCycles(ctx);

  parseEdges(ctx);
  const story = parseStory(ctx);
  checkBorders(ctx);
  const tagStyles = parseTagStyles(ctx);
  const views = parseViews(ctx);
  checkViews(ctx, views);

  const { nodes, groups, edges, stages, localIcons } = ctx;
  if (!nodes.length) {
    ctx.err("DG100", "the diagram has no nodes", { fixes: ["add at least one entry under nodes"] });
  }
  if (diagnostics.some((d) => d.severity === "error")) return { diagnostics };

  const { aspect, animate, background } = settings;
  const model: Model = {
    title: str(raw.title),
    subtitle: str(raw.subtitle),
    direction: settings.direction,
    theme: settings.theme,
    routing: settings.routing,
    spacing: settings.spacing,
    layering: settings.layering,
    merge: settings.merge,
    ...(aspect ? { aspect } : {}),
    arrowhead: settings.arrowhead,
    ...(animate ? { animate } : {}),
    skin: settings.skin,
    background: background === "transparent" ? "transparent" : background,
    ...(legend.length ? { legend } : {}),
    nodes,
    groups,
    edges,
    kind: settings.kind,
    ...(stages.length ? { stages } : {}),
    ...(story.length ? { story } : {}),
    ...(localIcons.length ? { icons: localIcons } : {}),
    ...(views.length ? { views } : {}),
    ...(Object.keys(tagStyles).length ? { tagStyles } : {}),
  };
  return { model, diagnostics };
}

/** The spec as a mapping, or undefined after a DG100 for bad syntax or a non-mapping. */
function readSource(source: string, filename: string, err: Report): Obj | undefined {
  let raw: unknown;
  try {
    raw = /\.json$/i.test(filename) ? JSON.parse(source) : parseYaml(source);
  } catch (e) {
    err("DG100", `cannot parse ${filename}: ${(e as Error).message.split("\n")[0]}`, {
      fixes: ["fix the YAML/JSON syntax at the reported line"],
    });
    return undefined;
  }
  if (!isObj(raw)) {
    err("DG100", "the spec must be a mapping with nodes, groups and edges", {
      fixes: ["start from `orrery init`"],
    });
    return undefined;
  }
  return raw;
}
