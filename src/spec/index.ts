// parseSpec: reads the source, then runs each step in the order its diagnostics are reported.
import { YAMLParseError } from "yaml";
import type { Diagnostic, Model } from "../types.ts";
import { newContext } from "./context.ts";
import { parseEdges } from "./edges.ts";
import { applyContains, checkAround, checkCycles, checkParents, parseGroups } from "./groups.ts";
import { TOP_KEYS } from "./keys.ts";
import { parseFragments, parseTimeline } from "./kinds.ts";
import { checkBorders, checkViews, parseTagStyles, parseViews, tagLegend } from "./meta.ts";
import { checkAlign, parseNodes } from "./nodes.ts";
import { applyClasses, applyIncludes, type IncludeReader } from "./reuse.ts";
import { parseLegend, parseLocalIcons, parseSettings, parseStages, parseStory } from "./top.ts";
import { isObj, type Obj, parseText, type Report, reporter, str, unknownKeys } from "./values.ts";

export interface ParseResult {
  model?: Model;
  diagnostics: Diagnostic[];
}

export interface ParseOptions {
  /** How `include:` files are read: from disk by default; false refuses them. */
  include?: IncludeReader;
}

export function parseSpec(
  source: string,
  filename = "diagram.yaml",
  opts: ParseOptions = {},
): ParseResult {
  const diagnostics: Diagnostic[] = [];
  const report = reporter(diagnostics);
  const read = readSource(source, filename, report.err);
  if (!read) return { diagnostics };
  // Shared specs and classes merge into the raw items first, so every check below reads them.
  const included = applyIncludes(read, filename, report, opts.include);
  const raw = applyClasses(included.raw, report, included.edgeNames);
  const ctx = newContext(raw, filename, diagnostics, report);

  unknownKeys(ctx, raw, TOP_KEYS, {}, "the top level");
  const settings = parseSettings(ctx);
  ctx.kind = settings.kind;
  const legend = parseLegend(ctx);
  parseLocalIcons(ctx);
  parseStages(ctx, settings.kind);
  // Before the items: a tag's style gives a node, group or edge its color and line.
  const tagStyles = parseTagStyles(ctx);

  parseGroups(ctx);
  parseNodes(ctx, settings);
  checkAlign(ctx);
  applyContains(ctx);
  checkAround(ctx);
  checkParents(ctx);
  checkCycles(ctx);

  parseEdges(ctx, included.edgeNames);
  // Fragments count messages, so they come after every edge.
  const fragments = parseFragments(ctx);
  const timeline = parseTimeline(ctx);
  const story = parseStory(ctx);
  checkBorders(ctx);
  legend.push(...tagLegend(ctx));
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
    ...(fragments.length ? { fragments } : {}),
    ...(timeline ? { timeline } : {}),
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
    raw = parseText(source, filename);
  } catch (e) {
    const hash = e instanceof YAMLParseError ? commentHash(source, e) : undefined;
    if (hash)
      err(
        "DG107",
        `line ${hash.line}: ${hash.key}: ${hash.value} inside { } is cut short; an unquoted # starts a YAML comment, which hides the rest of the line`,
        {
          subject: { line: hash.line, column: hash.column },
          fixes: [
            `write ${hash.key}: "${hash.value}" (the quotes keep the # from starting a comment)`,
          ],
        },
      );
    else
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

/**
 * Inside { }, `color: #2563eb` turns into a comment at the #, which also hides the closing } and
 * breaks the YAML a line or more later. The first such # on or before the line the parser
 * stopped at.
 */
function commentHash(source: string, e: YAMLParseError) {
  const stop = e.linePos?.[0]?.line ?? Number.POSITIVE_INFINITY;
  for (const [i, text] of source.split(/\r?\n/).slice(0, stop).entries()) {
    let quote = "";
    let depth = 0;
    for (let at = 0; at < text.length; at++) {
      const c = text[at];
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      else if (c === "#" && /\s/.test(text[at - 1] ?? "")) {
        const key = /([A-Za-z0-9_-]+):\s+$/.exec(text.slice(0, at))?.[1];
        const hex = /^#[0-9a-fA-F]{3,8}\b/.exec(text.slice(at))?.[0];
        if (depth > 0 && key && hex) return { line: i + 1, column: at + 1, key, value: hex };
        break;
      }
    }
  }
  return undefined;
}
