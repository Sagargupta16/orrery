// Groups, then the nesting checks that need every node and group: contains, around, in, cycles.
import { resolveCatalogIcon, suggestIcons } from "../icons/index.ts";
import { groupStyleKeys, resolveGroupStyle } from "../styles.ts";
import { type Ctx, claim, entries } from "./context.ts";
import { GROUP_KEYS, GROUP_SYNONYMS } from "./keys.ts";
import { metaOf, tagged } from "./meta.ts";
import { closest, suggestIds } from "./suggest.ts";
import { localFix, localIcon } from "./top.ts";
import { hexColor, isObj, type Obj, pick, str, unknownKeys } from "./values.ts";

export function parseGroups(ctx: Ctx) {
  for (const [id, value] of entries(ctx, ctx.raw.groups, "groups")) {
    if (id.startsWith("__invalid_")) continue;
    if (!claim(ctx, id, "group")) continue;
    parseGroup(ctx, id, value);
  }
}

function parseGroup(ctx: Ctx, id: string, value: unknown) {
  const { groups } = ctx;
  const g: Obj = isObj(value) ? value : typeof value === "string" ? { type: value } : {};
  unknownKeys(ctx, g, GROUP_KEYS, GROUP_SYNONYMS, `group "${id}"`);
  const type = str(pick(g, "type", GROUP_SYNONYMS)) ?? "box";
  const style = resolveGroupStyle(type);
  if (!style) {
    const near = closest(type, groupStyleKeys());
    ctx.err("DG102", `group "${id}" has unknown type "${type}"`, {
      subject: { group: id, type },
      fixes: [...(near ? [`use type "${near}"`] : []), "run `orrery styles` for every group type"],
    });
  }
  const iconValue = pick(g, "icon", GROUP_SYNONYMS);
  let icon: string | null | undefined;
  if (iconValue === false || iconValue === null || iconValue === "none") icon = null;
  else if (typeof iconValue === "string") {
    icon = localIcon(ctx, iconValue) ?? resolveCatalogIcon(iconValue);
    if (!icon) {
      ctx.err("DG101", `group "${id}" uses unknown icon "${iconValue}"`, {
        subject: { group: id, icon: iconValue },
        fixes: [...localFix(iconValue), ...suggestIcons(iconValue).map((s) => `use icon "${s}"`)],
      });
    }
  }
  const color = hexColor(ctx, pick(g, "color", GROUP_SYNONYMS), "color", `group "${id}"`, {
    group: id,
  });
  const fill = hexColor(
    ctx,
    pick(g, "fill", GROUP_SYNONYMS),
    "fill",
    `group "${id}"`,
    { group: id },
    ["none"],
  );
  const dashed = pick(g, "dashed", GROUP_SYNONYMS);
  if (dashed !== undefined && typeof dashed !== "boolean")
    ctx.err("DG107", `group "${id}" dashed must be true or false`, {
      subject: { group: id, dashed },
      fixes: ["write dashed: true (or false to keep the type's solid line)"],
    });
  const colsRaw = pick(g, "cols", GROUP_SYNONYMS);
  const cols =
    typeof colsRaw === "number" && Number.isInteger(colsRaw) && colsRaw >= 1 && colsRaw <= 12
      ? colsRaw
      : undefined;
  if (colsRaw !== undefined && cols === undefined)
    ctx.err("DG115", `group "${id}" cols must be a whole number from 1 to 12`, {
      subject: { group: id, cols: colsRaw },
      fixes: ["use cols: 2 for a 2 x 2 grid of four children"],
    });
  const meta = metaOf(ctx, g, `group "${id}"`, { group: id });
  groups.push({
    id,
    type: style?.key ?? "box",
    label: str(pick(g, "label", GROUP_SYNONYMS)) ?? style?.label ?? (style ? "" : id),
    parent: str(pick(g, "in", GROUP_SYNONYMS)),
    color: color ?? tagged(ctx, meta.tags).color,
    fill,
    icon,
    dashed: typeof dashed === "boolean" ? dashed : undefined,
    ...(cols ? { cols } : {}),
    ...meta,
  });
  const containsRaw = pick(g, "contains", GROUP_SYNONYMS);
  const contains = typeof containsRaw === "string" ? [containsRaw] : containsRaw;
  if (Array.isArray(contains)) {
    ctx.pendingContains.push([id, contains.map(String)]);
  } else if (contains !== undefined) {
    ctx.err("DG107", `group "${id}" contains must be a list of ids`, {
      subject: { group: id },
      fixes: [`write contains: [a, b]`],
    });
  }
  const around = pick(g, "around", GROUP_SYNONYMS);
  if (around !== undefined) {
    const group = groups[groups.length - 1];
    if (!Array.isArray(around) || !around.length) {
      ctx.err("DG107", `group "${id}" around must be a list of node or group ids`, {
        subject: { group: id },
        fixes: ["write around: [web-a, web-b]"],
      });
    } else if (group) {
      group.around = around.map(String);
      if (Array.isArray(contains)) {
        ctx.err("DG104", `group "${id}" uses both around and contains`, {
          subject: { group: id },
          fixes: ["use contains (or in:) to nest, around to outline nodes that live elsewhere"],
        });
      }
    }
  }
}

/** `contains` on a group is the same as `in` on each child. */
export function applyContains(ctx: Ctx) {
  const { nodes, groups, ids } = ctx;
  for (const [groupId, children] of ctx.pendingContains) {
    for (const child of children) {
      const target = nodes.find((x) => x.id === child) ?? groups.find((x) => x.id === child);
      if (!target) {
        ctx.err("DG104", `group "${groupId}" contains unknown id "${child}"`, {
          subject: { group: groupId, child },
          fixes: suggestIds(child, ids).map((s) => `use "${s}"`),
        });
        continue;
      }
      if (target.parent && target.parent !== groupId) {
        ctx.err("DG104", `"${child}" is placed in both "${target.parent}" and "${groupId}"`, {
          subject: { id: child },
          fixes: [`keep one parent for "${child}"`],
        });
        continue;
      }
      target.parent = groupId;
    }
  }
}

/** Every `around` member must exist, and overlays may not outline each other in a ring. */
export function checkAround(ctx: Ctx) {
  for (const g of ctx.groups) {
    for (const member of g.around ?? []) {
      if (ctx.ids.has(member)) continue;
      ctx.err("DG104", `group "${g.id}" is drawn around unknown id "${member}"`, {
        subject: { group: g.id, member },
        fixes: suggestIds(member, ctx.ids).map((x) => `use "${x}"`),
      });
    }
  }
  const around = new Map(ctx.groups.flatMap((g) => (g.around ? [[g.id, g.around] as const] : [])));
  const reported = new Set<string>();
  for (const start of around.keys()) {
    // Walk the overlays this one outlines; meeting it again closes a ring no order can draw.
    const path: string[] = [];
    const ringFrom = (id: string): string[] | undefined => {
      if (id === start && path.length) return [...path];
      if (path.includes(id)) return undefined;
      path.push(id);
      for (const member of around.get(id) ?? []) {
        const ring = around.has(member) ? ringFrom(member) : undefined;
        if (ring) return ring;
      }
      path.pop();
      return undefined;
    };
    const ring = ringFrom(start);
    if (!ring || ring.some((x) => reported.has(x))) continue;
    for (const x of ring) reported.add(x);
    ctx.err(
      "DG105",
      ring.length > 1
        ? `groups "${ring.join('", "')}" are drawn around each other`
        : `group "${start}" is drawn around itself`,
      {
        subject: { group: start },
        fixes: [`remove "${ring[1] ?? start}" from around: of "${start}"`],
      },
    );
  }
}

/** Every `in` must name a group that nests; a bad parent is reported and dropped. */
export function checkParents(ctx: Ctx) {
  const { nodes, groups, ids } = ctx;
  for (const item of [...nodes, ...groups]) {
    if (!item.parent) continue;
    const kind = ids.get(item.parent);
    if (kind === "group" && groups.find((x) => x.id === item.parent)?.around) {
      ctx.err(
        "DG104",
        `"${item.id}" is in "${item.parent}", an around group, which only outlines other ids`,
        {
          subject: { id: item.id, in: item.parent },
          fixes: [`list "${item.id}" under around: of "${item.parent}" instead`],
        },
      );
      item.parent = undefined;
      continue;
    }
    if (kind === "group") continue;
    ctx.err(
      "DG104",
      `"${item.id}" is in "${item.parent}", which ${kind ? "is a node, not a group" : "does not exist"}`,
      {
        subject: { id: item.id, in: item.parent },
        fixes: kind
          ? [`add a group and put both inside it`]
          : suggestIds(item.parent, ids, "group").map((s) => `use in: ${s}`),
      },
    );
    item.parent = undefined;
  }
}

/** Group nesting must be a tree. */
export function checkCycles(ctx: Ctx) {
  const { groups } = ctx;
  for (const g of groups) {
    const seen = new Set([g.id]);
    let p = g.parent;
    while (p) {
      if (seen.has(p)) {
        ctx.err("DG105", `groups "${[...seen].join('", "')}" contain each other`, {
          subject: { group: g.id },
          fixes: [`remove the "in" of one of them`],
        });
        g.parent = undefined;
        break;
      }
      seen.add(p);
      p = groups.find((x) => x.id === p)?.parent;
    }
  }
}
