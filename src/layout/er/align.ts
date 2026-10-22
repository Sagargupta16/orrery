// Joined rows on one line. ELK centers each table in its layer, which leaves the two rows a
// relationship joins a few px apart, so the line takes a short jog. Each table, in reading order,
// moves across the flow's rows (up or down, never along the flow) by at most three rows to line
// one of its rows up with the row it joins on a table placed before it: the move that lines up
// the most relationships, the smallest of those, and only where the table stays clear of every
// other node and inside its group.

import type { Box, ErField, ModelEdge, SceneNode } from "../../types.ts";
import { meet } from "../geometry.ts";
import type { AfterLayout } from "../hooks.ts";
import { SIZES } from "../sizes.ts";
import type { Joined } from "./rows.ts";
import { ROW, rowsOf } from "./table.ts";

/** The most a table moves: three rows. */
const MAX = 3 * ROW;
/** What a moved table keeps clear of other nodes, and inside its group. */
const CLEAR = 20;

const r = (v: number) => Math.round(v * 100) / 100;

/** The center line of a row, or of a node without fields. */
function lineOf(nd: SceneNode, field: ErField | undefined): number | undefined {
  if (!nd.fields?.length) {
    const b = nd.iconBox && nd.look === "icon" ? nd.iconBox : nd.box;
    return b.y + b.h / 2;
  }
  const row = field ? rowsOf(nd).find((f) => f.name === field.name) : undefined;
  return row ? row.box.y + row.box.h / 2 : undefined;
}

const across = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w;

/** Whether a level line at `y` between the facing sides of two tables runs clear of every node. */
function levelClear(ctx: AfterLayout, a: SceneNode, b: SceneNode, y: number): boolean {
  const [l, rt] = a.box.x < b.box.x ? [a, b] : [b, a];
  const x0 = l.box.x + l.box.w;
  const x1 = rt.box.x;
  return !ctx.nodes.some(
    (o) =>
      o !== a &&
      o !== b &&
      o.box.x < x1 &&
      o.box.x + o.box.w > x0 &&
      y > o.box.y - 12 &&
      y < o.box.y + o.box.h + 12,
  );
}

function fits(ctx: AfterLayout, nd: SceneNode, dy: number): boolean {
  const b = { ...nd.box, y: nd.box.y + dy };
  if (b.y < ctx.top + SIZES.pad - 0.5) return false;
  for (const o of ctx.nodes) {
    if (o === nd) continue;
    const foot = [o.box, o.iconBox, o.labelBox, o.noteBox, o.badgeBox].filter(
      (x): x is Box => !!x && x.w > 0 && x.h > 0,
    );
    if (foot.some((x) => meet(b, x, CLEAR))) return false;
  }
  const chain = new Set<string>();
  for (let p = nd.parent; p; p = ctx.groups.find((g) => g.id === p)?.parent) chain.add(p);
  for (const g of ctx.groups) {
    if (g.overlay || g.lane) continue;
    if (chain.has(g.id)) {
      const head = g.label.lines.length ? g.labelBox.y + g.labelBox.h : g.box.y;
      if (b.y < Math.max(head, g.box.y) + 12 || b.y + b.h > g.box.y + g.box.h - 12) return false;
    } else if (meet(b, g.box, 12)) return false;
  }
  return true;
}

function move(nd: SceneNode, dy: number): void {
  const seen = new Set<Box>();
  for (const b of [
    nd.box,
    nd.iconBox,
    nd.labelBox,
    nd.noteBox,
    nd.badgeBox,
    ...(nd.fields ?? []).map((f) => f.box),
  ]) {
    if (!b || seen.has(b)) continue;
    seen.add(b);
    b.y = r(b.y + dy);
  }
}

/** Moves tables across the flow so the rows their relationships join line up. */
export function alignTables(ctx: AfterLayout, joined: (e: ModelEdge) => Joined): void {
  const byId = new Map(ctx.nodes.map((n) => [n.id, n]));
  const order = ctx.nodes
    .filter((n) => n.fields?.length)
    .sort((a, b) =>
      ctx.horizontal
        ? a.box.x - b.box.x || a.box.y - b.box.y
        : a.box.y - b.box.y || a.box.x - b.box.x,
    );
  const placed = new Set<string>();
  // Tables that hold a line-up already (moved, or level with a table placed before): they stay.
  const held = new Set<string>();
  for (const nd of order) {
    const wants = new Map<number, { count: number; with: SceneNode[] }>();
    for (const e of ctx.model.edges) {
      if (e.from === e.to || (e.from !== nd.id && e.to !== nd.id)) continue;
      const mine = e.from === nd.id;
      const other = byId.get(mine ? e.to : e.from);
      // Placed before, and beside it: lined-up rows on tables one above the other gain nothing.
      if (!other || !placed.has(other.id) || across(nd.box, other.box)) continue;
      const rows = joined(e);
      const own = lineOf(nd, mine ? rows.from : rows.to);
      const theirs = lineOf(other, mine ? rows.to : rows.from);
      if (own === undefined || theirs === undefined) continue;
      const dy = r(theirs - own);
      if (Math.abs(dy) > MAX || !levelClear(ctx, nd, other, theirs)) continue;
      const want = wants.get(dy) ?? { count: 0, with: [] };
      want.count++;
      want.with.push(other);
      wants.set(dy, want);
    }
    placed.add(nd.id);
    const ranked = [...wants].sort(
      ([a, m], [b, k]) => k.count - m.count || Math.abs(a) - Math.abs(b),
    );
    for (const [dy, want] of ranked) {
      // Already lined up with the most it could be: it stays.
      if (Math.abs(dy) < 0.5) {
        held.add(nd.id);
        for (const o of want.with) held.add(o.id);
        break;
      }
      if (fits(ctx, nd, dy)) {
        move(nd, dy);
        held.add(nd.id);
        break;
      }
      // Blocked (the top margin, a neighbor): the table it joins moves instead, when one alone
      // does and holds no line-up of its own.
      const other = want.count === 1 ? want.with[0] : undefined;
      if (other && !held.has(other.id) && fits(ctx, other, -dy)) {
        move(other, -dy);
        held.add(other.id);
        held.add(nd.id);
        break;
      }
    }
  }
}
