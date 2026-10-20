// Nodes: icon, look and shape, BPMN, journey stage and score, link, size, label, rank and align.
import { iconInfo, resolveIcon, suggestIcons } from "../icons/index.ts";
import {
  BPMN_KINDS,
  type BpmnKind,
  type DiagramKind,
  isBpmnEvent,
  isBpmnGateway,
  LOOKS,
  type ModelNode,
  type NodeLook,
  SHAPES,
  type ShapeKind,
} from "../types.ts";
import { type Ctx, claim, entries } from "./context.ts";
import { ICON_ID, NODE_KEYS, NODE_SYNONYMS, SHAPE_SYNONYMS } from "./keys.ts";
import { closest, suggestIds } from "./suggest.ts";
import { localFix, localIcon, type Settings } from "./top.ts";
import { hexColor, isObj, type Obj, oneOf, pick, str, unknownKeys } from "./values.ts";

const hasControlChar = (s: string) =>
  [...s].some((ch) => {
    const c = ch.charCodeAt(0);
    return c <= 0x1f || c === 0x7f;
  });

export function parseNodes(ctx: Ctx, settings: Settings) {
  for (const [id, value] of entries(ctx, ctx.raw.nodes, "nodes")) {
    if (id.startsWith("__invalid_")) continue;
    if (!claim(ctx, id, "node")) continue;
    parseNode(ctx, settings, id, value);
  }
}

function parseNode(ctx: Ctx, settings: Settings, id: string, value: unknown) {
  const n = nodeObject(value);
  unknownKeys(ctx, n, NODE_KEYS, NODE_SYNONYMS, `node "${id}"`);
  const { icon, iconRaw } = nodeIcon(ctx, id, n);
  const { look, shape, bpmn } = nodeForm(ctx, id, n, icon, iconRaw, settings.defaultLook);
  const stage = nodeStage(ctx, id, n, settings.kind);
  const score = nodeScore(ctx, id, n);
  const url = nodeUrl(ctx, id, n);
  const color = hexColor(ctx, pick(n, "color", NODE_SYNONYMS), "color", `node "${id}"`, {
    node: id,
  });
  const iconSize = nodeSize(ctx, id, n, look);
  // Events, gateways and the UML initial and final states are often unnamed; everything else
  // falls back to its id.
  const label =
    str(pick(n, "label", NODE_SYNONYMS)) ??
    ((bpmn && (isBpmnEvent(bpmn) || isBpmnGateway(bpmn))) ||
    (!bpmn && (shape === "initial" || shape === "final"))
      ? ""
      : undefined) ??
    (icon ? iconInfo(icon)?.name : undefined) ??
    id;
  const { rank, align } = nodeRank(ctx, id, n);
  ctx.nodes.push({
    id,
    label,
    note: str(pick(n, "note", NODE_SYNONYMS)),
    icon,
    look,
    shape,
    parent: str(pick(n, "in", NODE_SYNONYMS)),
    color,
    badge: str(pick(n, "badge", NODE_SYNONYMS)),
    url,
    iconSize,
    ...(bpmn ? { bpmn } : {}),
    ...(stage !== undefined ? { stage } : {}),
    ...(score !== undefined ? { score } : {}),
    ...(rank !== undefined ? { rank } : {}),
    ...(align !== undefined ? { align } : {}),
  });
}

/** A node's definition as a mapping: a bare string is an icon id or a label. */
function nodeObject(value: unknown): Obj {
  if (isObj(value)) return value;
  if (typeof value === "string")
    return resolveIcon(value) || ICON_ID.test(value.trim()) ? { icon: value } : { label: value };
  if (value === null || value === undefined) return {};
  return { label: String(value) };
}

function nodeIcon(ctx: Ctx, id: string, n: Obj) {
  const iconRaw = str(pick(n, "icon", NODE_SYNONYMS));
  let icon: string | undefined;
  if (iconRaw) {
    icon = localIcon(ctx, iconRaw) ?? resolveIcon(iconRaw);
    if (!icon) {
      ctx.err("DG101", `node "${id}" uses unknown icon "${iconRaw}"`, {
        subject: { node: id, icon: iconRaw },
        fixes: [
          ...localFix(iconRaw),
          ...suggestIcons(iconRaw).map((s) => `use icon "${s}"`),
          `run \`orrery icons search ${iconRaw.split(":").pop()?.replace(/-/g, " ")}\``,
        ],
      });
    }
  }
  return { icon, iconRaw };
}

/** How the node is drawn: its look, its shape and any BPMN element. */
function nodeForm(
  ctx: Ctx,
  id: string,
  n: Obj,
  icon: string | undefined,
  iconRaw: string | undefined,
  defaultLook: NodeLook,
) {
  const lookRaw = pick(n, "look", NODE_SYNONYMS);
  let look: NodeLook = icon || iconRaw ? defaultLook : "shape";
  if (lookRaw !== undefined) look = oneOf<NodeLook>(ctx, lookRaw, LOOKS, look, `node "${id}" look`);
  if ((look === "icon" || look === "card") && !icon && !iconRaw) look = "shape";
  const shapeRaw = pick(n, "shape", NODE_SYNONYMS);
  const shape = oneOf<ShapeKind>(
    ctx,
    typeof shapeRaw === "string" ? (SHAPE_SYNONYMS[shapeRaw.toLowerCase()] ?? shapeRaw) : shapeRaw,
    SHAPES,
    "rounded",
    `node "${id}" shape`,
  );
  const bpmnRaw = pick(n, "bpmn", NODE_SYNONYMS);
  const bpmn =
    bpmnRaw === undefined
      ? undefined
      : oneOf<BpmnKind>(ctx, bpmnRaw, BPMN_KINDS, "task", `node "${id}" bpmn`);
  // A BPMN element is drawn in notation, with any icon small inside it.
  if (bpmn) look = "shape";
  if (pick(n, "shape", NODE_SYNONYMS) !== undefined && icon && lookRaw === undefined)
    look = "shape";
  return { look, shape, bpmn };
}

/** The journey column a node sits in. */
function nodeStage(ctx: Ctx, id: string, n: Obj, kind: DiagramKind) {
  const { stages } = ctx;
  const stage = str(pick(n, "stage", NODE_SYNONYMS))?.trim();
  if (stage !== undefined && !stages.includes(stage)) {
    const near = closest(stage, stages);
    ctx.err("DG112", `node "${id}" is in stage "${stage}", which stages does not list`, {
      subject: { node: id, stage },
      fixes: near
        ? [`use stage: ${near}`]
        : stages.length
          ? [`use one of ${stages.join(", ")}`]
          : [`add stages: [${stage}]`],
    });
  }
  if (kind === "journey" && stage === undefined && stages.length)
    ctx.err("DG112", `node "${id}" needs a stage: the journey column it sits in`, {
      subject: { node: id },
      fixes: [`add stage: ${stages[0]}`],
    });
  return stage;
}

function nodeScore(ctx: Ctx, id: string, n: Obj) {
  const scoreRaw = pick(n, "score", NODE_SYNONYMS);
  let score: number | undefined;
  if (scoreRaw !== undefined) {
    const v = Number(scoreRaw);
    if (typeof scoreRaw === "boolean" || !Number.isFinite(v) || v < -2 || v > 2)
      ctx.err("DG112", `node "${id}" score must be a number from -2 (very negative) to 2`, {
        subject: { node: id },
        fixes: ["use score: 1 for a good step, -2 for a painful one"],
      });
    else score = v;
  }
  return score;
}

function nodeUrl(ctx: Ctx, id: string, n: Obj) {
  const url = str(pick(n, "url", NODE_SYNONYMS));
  // Links end up in SVG and HTML; only schemes that cannot run code are allowed. Browsers drop
  // tabs and newlines inside a URL ("java<TAB>script:" runs), so control characters are
  // rejected outright and the scheme is read with all whitespace removed.
  if (url && hasControlChar(url)) {
    ctx.err("DG107", `node "${id}" url must not contain control characters (tab, newline ...)`, {
      subject: { node: id, url },
      fixes: ["use an https:// link on one line, without tabs or line breaks"],
    });
  } else if (url) {
    const bare = url.replace(/\s/g, "");
    if (/^[a-z][a-z0-9+.-]*:/i.test(bare) && !/^(https?|mailto):/i.test(bare)) {
      ctx.err("DG107", `node "${id}" url must be http(s), mailto or a relative path`, {
        subject: { node: id, url },
        fixes: ["use an https:// link"],
      });
    }
  }
  return url;
}

function nodeSize(ctx: Ctx, id: string, n: Obj, look: NodeLook) {
  const sizeRaw = pick(n, "size", NODE_SYNONYMS);
  let iconSize = look === "card" ? 32 : 48;
  if (typeof sizeRaw === "number") iconSize = Math.max(16, Math.min(128, sizeRaw));
  else if (sizeRaw !== undefined) {
    const named = { sm: 32, md: 48, lg: 64, xl: 80 } as Record<string, number>;
    const v = named[String(sizeRaw)];
    if (v) iconSize = v;
    else
      ctx.err("DG107", `node "${id}" size must be sm, md, lg, xl or a number of px`, {
        subject: { node: id },
        fixes: ["use size: lg, or a number such as 64"],
      });
  }
  return iconSize;
}

/** Layer control: `rank` pins the layer, `align` (checked later) shares another node's. */
function nodeRank(ctx: Ctx, id: string, n: Obj): Pick<ModelNode, "rank" | "align"> {
  const rankRaw = pick(n, "rank", NODE_SYNONYMS);
  const rank =
    rankRaw === "first" || rankRaw === "last"
      ? rankRaw
      : typeof rankRaw === "number" && Number.isInteger(rankRaw) && rankRaw >= 1
        ? rankRaw
        : undefined;
  if (rankRaw !== undefined && rank === undefined)
    ctx.err("DG114", `node "${id}" rank must be first, last or a layer number from 1`, {
      subject: { node: id, rank: rankRaw },
      fixes: ["use rank: first to start the flow here, rank: last to end it"],
    });
  const align = str(pick(n, "align", NODE_SYNONYMS));
  if (align !== undefined) ctx.pendingAlign.push([id, align]);
  if (align !== undefined && rank !== undefined)
    ctx.err("DG114", `node "${id}" uses both rank and align`, {
      subject: { node: id },
      fixes: [`keep align: ${align} to share that node's layer, or rank: ${rank}, not both`],
    });
  return { rank, align };
}

/** `align` names another node: the two share one layer of the flow. */
export function checkAlign(ctx: Ctx) {
  for (const [id, target] of ctx.pendingAlign) {
    if (target === id)
      ctx.err("DG114", `node "${id}" aligns with itself`, {
        subject: { node: id },
        fixes: ["name another node: align: <id>"],
      });
    else if (ctx.ids.get(target) !== "node")
      ctx.err("DG114", `node "${id}" aligns with "${target}", which is not a node`, {
        subject: { node: id, align: target },
        fixes: suggestIds(target, ctx.ids, "node").map((x) => `use align: ${x}`),
      });
  }
}
