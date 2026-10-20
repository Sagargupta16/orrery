// Top-level fields: kind and its defaults, theme, layout, legend, icons, stages and story.
import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import {
  ANIMATE_MODES,
  type AnimateMode,
  DIAGRAM_KINDS,
  DIRECTIONS,
  type DiagramKind,
  type Direction,
  EDGE_LINES,
  type EdgeLine,
  type LegendEntry,
  type Model,
  type NodeLook,
  ROUTINGS,
  type Routing,
  SKINS,
  SPACINGS,
  THEMES,
  type ThemeName,
} from "../types.ts";
import type { Ctx } from "./context.ts";
import { ICON_NAME, KIND_DEFAULTS, LAYOUT_KEYS } from "./keys.ts";
import { closest, suggestIds } from "./suggest.ts";
import { hexColor, isObj, oneOf, str, unknownKeys } from "./values.ts";

/** The top-level settings, with each kind's defaults filled in. */
export interface Settings
  extends Pick<Model, "kind" | "direction" | "theme" | "arrowhead" | "skin">,
    LayoutSettings {
  defaultLook: NodeLook;
  animate: AnimateMode | undefined;
  background: string | undefined;
}

type LayoutSettings = Pick<Model, "routing" | "spacing" | "layering" | "merge"> & {
  /** Undefined when unset, null when it cannot be read (DG116). */
  aspect: number | undefined | null;
};

export function parseSettings(ctx: Ctx): Settings {
  const { raw } = ctx;
  const kind = oneOf<DiagramKind>(ctx, raw.kind, DIAGRAM_KINDS, "architecture", "kind");
  const kindDefaults = KIND_DEFAULTS[kind];
  const direction = oneOf<Direction>(
    ctx,
    raw.direction,
    DIRECTIONS,
    kindDefaults.direction,
    "direction",
  );
  // Dark and stage are the defaults; `theme: light` and `skin: classic` are one line away.
  const theme = oneOf<ThemeName>(ctx, raw.theme, THEMES, "dark", "theme");
  const defaultLook = oneOf<NodeLook>(ctx, raw.look, ["icon", "card"] as const, "icon", "look");
  const layout = parseLayout(ctx);
  const arrowhead = oneOf(
    ctx,
    raw.arrowhead,
    ["open", "filled"] as const,
    kindDefaults.arrowhead,
    "arrowhead",
  );
  // Unset: the skin picks (relay for stage, packets for classic).
  const animate =
    raw.animate === undefined
      ? undefined
      : raw.animate === true
        ? "packets"
        : raw.animate === false
          ? "none"
          : oneOf(ctx, raw.animate, ANIMATE_MODES, "packets", "animate");
  const skin = oneOf(ctx, raw.skin, SKINS, "stage", "skin");
  const background = hexColor(ctx, raw.background, "background", "", { where: "background" }, [
    "transparent",
  ]);
  return { kind, direction, theme, defaultLook, ...layout, arrowhead, animate, skin, background };
}

function parseLayout(ctx: Ctx): LayoutSettings {
  const { raw } = ctx;
  const layout = isObj(raw.layout) ? raw.layout : {};
  if (raw.layout !== undefined && !isObj(raw.layout))
    ctx.err("DG107", "layout must be a mapping", {
      subject: { where: "layout" },
      fixes: ["write layout: { spacing: normal, routing: orthogonal }"],
    });
  unknownKeys(ctx, layout, LAYOUT_KEYS, {}, "layout");
  const routing = oneOf<Routing>(ctx, layout.routing, ROUTINGS, "orthogonal", "layout.routing");
  let spacing = 1;
  if (typeof layout.spacing === "number") spacing = Math.max(0.5, Math.min(3, layout.spacing));
  else {
    const s = oneOf(ctx, layout.spacing, SPACINGS, "normal", "layout.spacing");
    spacing = { compact: 0.75, normal: 1, loose: 1.35 }[s];
  }
  const layering = oneOf(
    ctx,
    layout.layering,
    ["source", "simplex"] as const,
    "source",
    "layout.layering",
  );
  if (layout.merge !== undefined && typeof layout.merge !== "boolean") {
    ctx.err("DG107", "layout.merge must be true or false", {
      subject: { where: "layout.merge" },
      fixes: ["use layout: { merge: false } to give every edge its own port"],
    });
  }
  const merge = layout.merge !== false;
  const aspect = aspectOf(layout.aspect);
  if (aspect === null)
    ctx.err("DG116", "layout.aspect must be a width:height ratio such as 4:3, 16:9 or 1.5", {
      subject: { where: "layout.aspect", value: layout.aspect },
      fixes: ["use layout: { aspect: 4:3 } for a compact figure, 16:9 for a slide"],
    });
  return { routing, spacing, layering, merge, aspect };
}

/** layout.aspect as width / height: undefined when unset, null when it cannot be read. */
function aspectOf(value: unknown): number | undefined | null {
  if (value === undefined || value === null) return undefined;
  let ratio = Number.NaN;
  if (typeof value === "number") ratio = value;
  else if (typeof value === "string") {
    const m = /^\s*(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)\s*$/.exec(value);
    ratio = m ? Number(m[1]) / Number(m[2]) : Number(value);
  }
  return Number.isFinite(ratio) && ratio >= 0.25 && ratio <= 4 ? ratio : null;
}

/** Which line style means what, drawn as a key under the diagram. */
export function parseLegend(ctx: Ctx): LegendEntry[] {
  const { raw } = ctx;
  const legend: LegendEntry[] = [];
  if (raw.legend !== undefined && raw.legend !== null && !isObj(raw.legend)) {
    ctx.err("DG107", "legend must be a mapping of line style to meaning", {
      subject: { where: "legend" },
      fixes: ["write legend: { dashed: Asynchronous events, dotted: Replication }"],
    });
  } else if (isObj(raw.legend)) {
    for (const [key, value] of Object.entries(raw.legend)) {
      const line = key.trim().toLowerCase() as EdgeLine;
      const label = str(value)?.trim();
      if (!EDGE_LINES.includes(line)) {
        const near = closest(key, EDGE_LINES);
        const fixes = [near ? `use "${near}"` : `use one of ${EDGE_LINES.join(", ")}`];
        // In a YAML flow mapping {...}, a comma inside an unquoted meaning starts a new key.
        if (value === null) fixes.push("a comma split an unquoted meaning; quote the whole text");
        ctx.err(
          "DG107",
          `legend line style must be one of ${EDGE_LINES.join(", ")}; got "${key}"`,
          {
            subject: { where: "legend", key },
            fixes,
          },
        );
      } else if (!label) {
        ctx.err("DG107", `legend ${line} needs a meaning`, {
          subject: { where: "legend", key },
          fixes: [`write ${line}: Asynchronous events`],
        });
      } else legend.push({ line, label });
    }
  }
  return legend;
}

/** SVG files the spec registers as local:<name> icons, read relative to the spec's folder. */
export function parseLocalIcons(ctx: Ctx) {
  const { raw } = ctx;
  if (raw.icons !== undefined && raw.icons !== null && !isObj(raw.icons)) {
    ctx.err("DG111", "icons must be a mapping of a name to an .svg file", {
      subject: { where: "icons" },
      fixes: ["write icons: { brand: ./icons/brand.svg }, then use icon: local:brand"],
    });
  } else if (isObj(raw.icons)) {
    const base = dirname(resolve(ctx.filename));
    for (const [name, value] of Object.entries(raw.icons)) {
      const file = str(value)?.trim();
      if (!ICON_NAME.test(name)) {
        ctx.err("DG111", `icon name "${name}" may only use lowercase letters, digits and "-"`, {
          subject: { where: "icons", name },
          fixes: [`rename to "${name.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}"`],
        });
      } else if (!file || !/\.svg$/i.test(file)) {
        ctx.err("DG111", `icon "${name}" must point to an .svg file`, {
          subject: { where: "icons", name },
          fixes: [`write ${name}: ./icons/${name}.svg`],
        });
      } else {
        const path = isAbsolute(file) ? file : resolve(base, file);
        if (!existsSync(path))
          ctx.err("DG111", `icon "${name}": ${file} not found`, {
            subject: { where: "icons", name, file },
            fixes: [
              "check the path; it is read relative to the spec's folder",
              `make one with \`orrery icons new ${name}\``,
            ],
          });
        else ctx.localIcons.push({ name, path });
      }
    }
  }
}

/** A declared local:<name> icon id, or undefined. */
export const localIcon = (ctx: Ctx, value: string): string | undefined => {
  const m = value.trim().match(/^local:([a-z0-9][a-z0-9-]*)$/i);
  const name = m?.[1]?.toLowerCase();
  return name && ctx.localIcons.some((i) => i.name === name) ? `local:${name}` : undefined;
};

export const localFix = (value: string): string[] =>
  /^local:/i.test(value.trim())
    ? [`declare it: icons: { ${value.trim().slice(6)}: ./${value.trim().slice(6)}.svg }`]
    : [];

/** Journey columns, in order. */
export function parseStages(ctx: Ctx, kind: DiagramKind) {
  const { raw, stages } = ctx;
  if (raw.stages !== undefined && raw.stages !== null) {
    if (!Array.isArray(raw.stages) || raw.stages.some((x) => typeof x !== "string" || !x.trim()))
      ctx.err("DG112", "stages must be a list of stage names", {
        subject: { where: "stages" },
        fixes: ["write stages: [Discover, Sign up, Onboard, Use]"],
      });
    else stages.push(...raw.stages.map((x: string) => x.trim()));
  }
  if (kind === "journey" && !stages.length)
    ctx.err("DG112", "a journey needs stages: the columns its steps sit in", {
      subject: { where: "stages" },
      fixes: ["add stages: [Discover, Sign up, Onboard, Use]"],
    });
}

/** The path the stage story takes: node ids in order, each hop along an edge. */
export function parseStory(ctx: Ctx): string[] {
  const { raw, ids, edges } = ctx;
  const story: string[] = [];
  if (raw.story !== undefined && raw.story !== null) {
    if (!Array.isArray(raw.story) || raw.story.length < 2) {
      ctx.err(
        "DG113",
        "story must be a list of at least two node ids, in the order the story visits them",
        {
          subject: { where: "story" },
          fixes: ["write story: [customer, order, payment, shipping]"],
        },
      );
    } else {
      for (const item of raw.story.map(String)) {
        if (ids.get(item) !== "node")
          ctx.err("DG113", `story visits "${item}", which is not a node`, {
            subject: { where: "story", id: item },
            fixes: suggestIds(item, ids, "node").map((x) => `use "${x}"`),
          });
        else story.push(item);
      }
      for (let i = 1; i < story.length; i++) {
        const a = story[i - 1];
        const b = story[i];
        if (!edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a)))
          ctx.warn("DG113", `story goes from "${a}" to "${b}", which no edge connects`, {
            subject: { where: "story", from: a, to: b },
            fixes: [`add an edge ${a} -> ${b}, or drop one of them from story`],
          });
      }
    }
  }
  return story;
}
