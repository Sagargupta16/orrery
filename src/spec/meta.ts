// Fields any node, group or edge may carry besides its drawing: `tags:` (for views and tag
// styles) and `evidence:` (where it comes from, checked by `orrery verify`); plus the top-level
// `tags:` styles and `views:`.
import type { ModelView, TagStyle } from "../types.ts";
import { EDGE_LINES } from "../types.ts";
import type { Ctx } from "./context.ts";
import { hexColor, isObj, type Obj, str } from "./values.ts";

const TAG = /^[a-z0-9][a-z0-9_-]*$/i;

/** `tags: [a, b]` or `tags: a` and `evidence: path:line` or a list, as model fields. */
export function metaOf(
  ctx: Ctx,
  item: Obj,
  where: string,
  subject: Record<string, unknown>,
): { tags?: string[]; evidence?: string[] } {
  const out: { tags?: string[]; evidence?: string[] } = {};
  const tags = listOf(item.tags);
  if (tags === null || tags?.some((t) => !TAG.test(t)))
    ctx.err("DG117", `${where} tags must be a list of short names (letters, digits, - and _)`, {
      subject,
      fixes: ["write tags: [payments, pci]"],
    });
  else if (tags?.length) out.tags = tags;
  const evidence = listOf(item.evidence);
  if (evidence === null || evidence?.some((e) => !e.trim()))
    ctx.err("DG119", `${where} evidence must be a file and line (infra/main.tf:40) or a list`, {
      subject,
      fixes: ["write evidence: infra/main.tf:40, or evidence: [src/api.ts:12, infra/api.tf:8]"],
    });
  else if (evidence?.length) out.evidence = evidence.map((e) => e.trim());
  return out;
}

/** A string or a list of strings; undefined when unset, null when it is something else. */
function listOf(value: unknown): string[] | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((v) => typeof v === "string" || typeof v === "number"))
    return value.map(String);
  return null;
}

/** Top-level `tags:`: a style per tag name (color, line, legend label). */
export function parseTagStyles(ctx: Ctx): Record<string, TagStyle> {
  const raw = ctx.raw.tags;
  if (raw === undefined || raw === null) return {};
  if (!isObj(raw)) {
    ctx.err("DG117", "tags must be a mapping of a tag name to its style", {
      subject: { where: "tags" },
      fixes: ['write tags: { pci: { color: "#C7243A", label: Card data } }'],
    });
    return {};
  }
  const styles: Record<string, TagStyle> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!TAG.test(name) || !isObj(value)) {
      ctx.err("DG117", `tag "${name}" needs a style mapping`, {
        subject: { where: "tags", tag: name },
        fixes: [`write ${TAG.test(name) ? name : "pci"}: { color: "#C7243A", label: Card data }`],
      });
      continue;
    }
    const style: TagStyle = {};
    const color = hexColor(ctx, value.color, "color", `tag "${name}"`, { tag: name });
    if (color) style.color = color;
    if (value.line !== undefined) {
      if (EDGE_LINES.includes(value.line as never)) style.line = value.line as TagStyle["line"];
      else
        ctx.err("DG117", `tag "${name}" line must be ${EDGE_LINES.join(", ")}`, {
          subject: { where: "tags", tag: name },
          fixes: ["use line: dashed"],
        });
    }
    const label = str(value.label);
    if (label) style.label = label;
    styles[name] = style;
  }
  return styles;
}

/** Top-level `views:`: named subsets of the diagram, drawn as their own figures. */
export function parseViews(ctx: Ctx): ModelView[] {
  const raw = ctx.raw.views;
  if (raw === undefined || raw === null) return [];
  if (!isObj(raw)) {
    ctx.err("DG118", "views must be a mapping of a view name to what it shows", {
      subject: { where: "views" },
      fixes: ["write views: { request: { include: [api, db], title: Request path } }"],
    });
    return [];
  }
  const views: ModelView[] = [];
  for (const [name, value] of Object.entries(raw)) {
    const v: Obj = isObj(value) ? value : {};
    if (!TAG.test(name) || !isObj(value)) {
      ctx.err("DG118", `view "${name}" needs a mapping with include, exclude, depth or title`, {
        subject: { where: "views", view: name },
        fixes: [`write ${TAG.test(name) ? name : "overview"}: { include: [api, db] }`],
      });
      continue;
    }
    const include = listOf(v.include);
    const exclude = listOf(v.exclude);
    const depth = v.depth;
    if (include === null || exclude === null)
      ctx.err("DG118", `view "${name}" include and exclude must be lists of ids or tag:<name>`, {
        subject: { where: "views", view: name },
        fixes: ["write include: [api, tag:payments, group:vpc]"],
      });
    if (
      depth !== undefined &&
      !(typeof depth === "number" && Number.isInteger(depth) && depth >= 0)
    )
      ctx.err("DG118", `view "${name}" depth must be a whole number from 0`, {
        subject: { where: "views", view: name },
        fixes: ["use depth: 1 to show the top-level groups and what sits directly in them"],
      });
    views.push({
      name,
      ...(str(v.title) ? { title: str(v.title) } : {}),
      ...(str(v.subtitle) ? { subtitle: str(v.subtitle) } : {}),
      ...(include?.length ? { include } : {}),
      ...(exclude?.length ? { exclude } : {}),
      ...(typeof depth === "number" ? { depth } : {}),
    });
  }
  return views;
}

/** Every include or exclude entry names a node, a group, `tag:<name>` or `group:<id>`. */
export function checkViews(ctx: Ctx, views: ModelView[]) {
  const tags = new Set<string>();
  for (const x of [...ctx.nodes, ...ctx.groups, ...ctx.edges])
    for (const t of x.tags ?? []) tags.add(t);
  for (const v of views)
    for (const entry of [...(v.include ?? []), ...(v.exclude ?? [])]) {
      const [kind, rest] = entry.includes(":") ? entry.split(/:(.*)/s) : ["", entry];
      const ok =
        kind === "tag"
          ? tags.has(rest ?? "")
          : kind === "group"
            ? ctx.groups.some((g) => g.id === rest)
            : kind === ""
              ? ctx.ids.has(entry)
              : false;
      if (!ok)
        ctx.warn("DG118", `view "${v.name}" names "${entry}", which is no node, group or tag`, {
          subject: { where: "views", view: v.name, entry },
          fixes: ["use a node or group id, group:<id> or tag:<name>"],
        });
    }
}

/** `on: <group>` puts a node on that group's border (an internet gateway on its VPC). */
export function checkBorders(ctx: Ctx) {
  for (const n of ctx.nodes) {
    if (!n.on) continue;
    if (!ctx.groups.some((g) => g.id === n.on))
      ctx.err("DG120", `node "${n.id}" sits on "${n.on}", which is not a group`, {
        subject: { node: n.id, on: n.on },
        fixes: ["name the group whose border the node sits on: on: vpc"],
      });
  }
}
