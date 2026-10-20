// Edges against group frames: through a group that holds neither end, along a border line, and
// in or beside a group's title.
import type { Box, Point, SceneGroup } from "../types.ts";
import type { CheckContext } from "./context.ts";
import { boxOf, EPS, headerChip, pointOf, segmentHitsBox, tenth } from "./geometry.ts";

/**
 * Within this many canvas px of a border line a run reads as on it (DG224), and a run through a
 * group has to clear its border by more (DG223). orrery draws group borders 1 to 2px wide.
 */
const BORDER_PX = 4;
/** A run along a border shorter than this (canvas px) is a corner or a crossing, not a riser. */
const ALONG_MIN = 24;
/**
 * The title band (DG225): 28px under the top border. orrery's header label starts 6 to 10px down
 * and its 13px text ends about 28px down beside an inline icon or a 40px corner tile, so 28 canvas
 * px covers it; a taller header label extends the band to its bottom.
 */
const TITLE_BAND = 28;
/**
 * A vertical run closer than this (canvas px) to the right of a group title crowds it (DG225).
 * Bare text would need 12px; orrery paints a 4px chip behind the title, and its header slide
 * (layout/groups.ts clearHeader) keeps lines 2px past the chip, 6px from the text. Every example's
 * lines sit 6 to 11px off and read clear; a closer one is a line the slide missed, and the chip
 * notches its stroke.
 */
const TITLE_CLEAR = 6;

/** Pools, lanes and overlays are crossed by design, so the frame rules skip them. */
const framed = (g: SceneGroup) => !g.overlay && !g.lane && g.type !== "pool" && g.type !== "lane";

/** The span lo..hi of a straight run along x or y, or undefined for a diagonal or a dot. */
function runOf(
  p: Point,
  q: Point,
): { vertical: boolean; at: number; lo: number; hi: number } | undefined {
  if (Math.abs(p.x - q.x) < EPS && Math.abs(p.y - q.y) >= EPS)
    return { vertical: true, at: p.x, lo: Math.min(p.y, q.y), hi: Math.max(p.y, q.y) };
  if (Math.abs(p.y - q.y) < EPS && Math.abs(p.x - q.x) >= EPS)
    return { vertical: false, at: p.y, lo: Math.min(p.x, q.x), hi: Math.max(p.x, q.x) };
  return undefined;
}

/** The segments of a path as point pairs. */
const segmentsOf = (pts: Point[]): [Point, Point][] =>
  pts.slice(1).map((q, i) => [pts[i] as Point, q]);

/** Whether b lies within the box g (EPS slack). */
const within = (b: Box, g: Box) =>
  b.x >= g.x - EPS &&
  b.y >= g.y - EPS &&
  b.x + b.w <= g.x + g.w + EPS &&
  b.y + b.h <= g.y + g.h + EPS;

/**
 * DG223: an edge cuts through a group that holds neither of its ends: it enters and leaves the
 * frame, so it reads as belonging there; an edge between groups should run around the ones it
 * passes. A group that holds a member of an `around:` endpoint holds that end. Only the
 * outermost group crossed is reported, and a group that frames every node is skipped.
 */
export function edgeThroughGroup({ scene, model, parentOf, warn }: CheckContext): void {
  const under = (id: string, gid: string) => {
    for (let p: string | undefined = id; p; p = parentOf.get(p)) if (p === gid) return true;
    return false;
  };
  const holds = (gid: string, id: string) =>
    under(id, gid) || !!model.groups.find((g) => g.id === id)?.around?.some((m) => under(m, gid));
  const groups = scene.groups.filter(
    (g) => framed(g) && !scene.nodes.every((n) => within(n.box, g.box)),
  );
  for (const e of scene.edges) {
    const cut = groups.flatMap((g) => {
      if (holds(g.id, e.from) || holds(g.id, e.to)) return [];
      const hit = segmentsOf(e.points).find(([p, q]) => segmentHitsBox(p, q, g.box, BORDER_PX));
      return hit ? [{ g, hit }] : [];
    });
    for (const { g, hit } of cut) {
      if (cut.some((o) => o.g !== g && under(g.id, o.g.id))) continue;
      warn(
        "DG223",
        `edge ${e.from} -> ${e.to} cuts through group "${g.id}", which holds neither end`,
        {
          subject: { edge: e.id, from: e.from, to: e.to, group: g.id },
          evidence: { group: boxOf(g.box), segment: hit.map(pointOf) },
          fixes: [
            `move "${e.from}" or "${e.to}" in the nodes list so the edge runs around "${g.id}"`,
            `put the end that belongs with "${g.id}" in it (in: ${g.id}), or connect to the group itself`,
            "try layout: { layering: simplex }",
            "change direction",
          ],
        },
      );
    }
  }
}

/**
 * DG224: a straight run lies on a group's border line (within BORDER_PX, over more than
 * ALONG_MIN), so it hides under the stroke and the frame reads as broken: no elbow riser should
 * run along a group border. One finding per edge and group.
 */
export function edgeAlongBorder({ scene, warn }: CheckContext): void {
  for (const e of scene.edges) {
    if (scene.routing === "spline" && (e.points.length - 1) % 3 === 0 && e.points.length > 2)
      continue;
    for (const g of scene.groups) {
      const r = g.box;
      const borders = [
        { side: "left", vertical: true, at: r.x, lo: r.y, hi: r.y + r.h },
        { side: "right", vertical: true, at: r.x + r.w, lo: r.y, hi: r.y + r.h },
        { side: "top", vertical: false, at: r.y, lo: r.x, hi: r.x + r.w },
        { side: "bottom", vertical: false, at: r.y + r.h, lo: r.x, hi: r.x + r.w },
      ];
      let found: { side: string; off: number; len: number; seg: [Point, Point] } | undefined;
      for (const seg of segmentsOf(e.points)) {
        const run = runOf(...seg);
        if (!run) continue;
        for (const b of borders) {
          const off = Math.abs(run.at - b.at);
          const len = Math.min(run.hi, b.hi) - Math.max(run.lo, b.lo);
          if (b.vertical !== run.vertical || off > BORDER_PX || len <= ALONG_MIN) continue;
          if (!found || len > found.len) found = { side: b.side, off, len, seg };
        }
      }
      if (!found) continue;
      warn(
        "DG224",
        `edge ${e.from} -> ${e.to} runs ${tenth(found.len)}px along the ${found.side} border of group "${g.id}" (${tenth(found.off)}px off it), so the line hides under the frame`,
        {
          subject: { edge: e.id, from: e.from, to: e.to, group: g.id },
          evidence: {
            group: boxOf(r),
            side: found.side,
            offPx: tenth(found.off),
            alongPx: tenth(found.len),
            segment: found.seg.map(pointOf),
          },
          fixes: [
            `move "${e.from}" or "${e.to}" in the nodes list so the turn lands clear of "${g.id}"`,
            "use layout: { spacing: loose }",
            "try layout: { layering: simplex }",
          ],
        },
      );
    }
  }
}

/**
 * DG225: an edge label sits in a group's title band (it reads as part of the title), or a
 * vertical run passes closer than TITLE_CLEAR px to the right of the title, crowding it. A label
 * across the top border is DG220 and a run through the title's chip is DG209, so neither counts
 * here.
 */
export function edgeNearTitle({ scene, warn }: CheckContext): void {
  for (const g of scene.groups) {
    const chip = headerChip(g);
    if (!framed(g) || !chip) continue;
    const r = g.box;
    const t = g.labelBox;
    const band = Math.max(TITLE_BAND, t.y + t.h - r.y);
    for (const e of scene.edges) {
      const b = e.labelBox;
      if (!b || !e.label) continue;
      const onTop = r.y > b.y + 1 && r.y < b.y + b.h - 1;
      const inBand = b.y < r.y + band && b.y + b.h > r.y && b.x >= r.x && b.x + b.w <= r.x + r.w;
      if (onTop || !inBand) continue;
      warn(
        "DG225",
        `label "${e.label.lines.join(" ")}" on ${e.from} -> ${e.to} sits in the title band of group "${g.id}", so it reads as part of the title`,
        {
          subject: { edge: e.id, from: e.from, to: e.to, group: g.id },
          evidence: { label: boxOf(b), band: boxOf({ x: r.x, y: r.y, w: r.w, h: band }) },
          fixes: [
            `move "${e.from}" or "${e.to}" in the nodes list so the edge enters "${g.id}" from the side`,
            "use layout: { spacing: loose }",
            "shorten the label",
          ],
        },
      );
    }
    for (const e of scene.edges) {
      const near = segmentsOf(e.points).find(([p, q]) => {
        const run = runOf(p, q);
        const gap = run ? run.at - (t.x + t.w) : -1;
        return (
          !!run?.vertical &&
          gap > 0 &&
          gap < TITLE_CLEAR - EPS &&
          run.lo < t.y + t.h &&
          run.hi > t.y &&
          !segmentHitsBox(p, q, chip, EPS)
        );
      });
      if (!near) continue;
      const gap = near[0].x - (t.x + t.w);
      warn(
        "DG225",
        `edge ${e.from} -> ${e.to} passes ${tenth(gap)}px to the right of the title of group "${g.id}", which crowds it`,
        {
          subject: { edge: e.id, from: e.from, to: e.to, group: g.id },
          evidence: {
            title: boxOf(t),
            gapPx: tenth(gap),
            minPx: TITLE_CLEAR,
            segment: near.map(pointOf),
          },
          fixes: [
            `move "${e.from}" or "${e.to}" in the nodes list so the edge enters "${g.id}" from the side`,
            "use layout: { spacing: loose }",
            `shorten the label of group "${g.id}"`,
          ],
        },
      );
    }
  }
}
