import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dayOf, floorTo, isoOf, nextOf, spanOf } from "../src/layout/timeline/dates.ts";
import { timelineLayout } from "../src/layout/timeline/index.ts";
import type { Ctx as DrawioCtx } from "../src/render/drawio.ts";
import { renderDrawio } from "../src/render/drawio.ts";
import { timelineDrawio, timelineItemDrawio } from "../src/render/drawio-timeline.ts";
import { timelineMermaid } from "../src/render/mermaid-timeline.ts";
import { renderSvg } from "../src/render/svg.ts";
import { RISK } from "../src/render/timeline.ts";
import { reviewModel } from "../src/review/index.ts";
import { measureTimeline } from "../src/review/notations-timeline.ts";
import type { Ctx as ReviewCtx } from "../src/review/types.ts";
import { parseSpec } from "../src/spec/index.ts";
import { tokensFor } from "../src/themes.ts";
import type { Box, Point, Scene, ThemeName } from "../src/types.ts";
import { EXAMPLES_DIR, model, must, overlap, xmlProblems } from "./helpers.ts";

async function scene(source: string, theme: ThemeName = "light"): Promise<Scene> {
  return must(await timelineLayout(model(source), theme), "a timeline scene");
}

const tl = (s: Scene) => must(s.timeline, "scene.timeline");
const node = (s: Scene, id: string) =>
  must(
    s.nodes.find((n) => n.id === id),
    `node ${id}`,
  );
const item = (s: Scene, id: string) =>
  must(
    tl(s).items.find((x) => x.id === id),
    `item ${id}`,
  );

/** The drawn footprint of a scene node: its bar or marker, label, note and icon. */
function footprint(s: Scene, id: string): Box {
  const nd = node(s, id);
  const parts = [nd.box, nd.labelBox, nd.noteBox, nd.iconBox].filter((b): b is Box => !!b);
  const x = Math.min(...parts.map((b) => b.x));
  const y = Math.min(...parts.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...parts.map((b) => b.x + b.w)) - x,
    h: Math.max(...parts.map((b) => b.y + b.h)) - y,
  };
}

const onBorder = (p: Point, b: Box) =>
  (Math.abs(p.x - b.x) < 0.6 || Math.abs(p.x - b.x - b.w) < 0.6
    ? p.y >= b.y - 0.6 && p.y <= b.y + b.h + 0.6
    : false) ||
  (Math.abs(p.y - b.y) < 0.6 || Math.abs(p.y - b.y - b.h) < 0.6
    ? p.x >= b.x - 0.6 && p.x <= b.x + b.w + 0.6
    : false);

const crosses = (p: Point, q: Point, b: Box) =>
  Math.min(p.x, q.x) < b.x + b.w - 1 &&
  b.x + 1 < Math.max(p.x, q.x) &&
  Math.min(p.y, q.y) < b.y + b.h - 1 &&
  b.y + 1 < Math.max(p.y, q.y);

const ROADMAP = `title: Roadmap
kind: timeline
skin: classic
timeline: { scale: quarter, start: 2026-Q1, end: 2026-Q4, today: 2026-05-18 }
groups:
  platform: { label: Platform }
  apps: { label: Apps }
  mobile: { label: Mobile, in: apps }
nodes:
  beta: { label: Beta, date: 2026-03-16, milestone: true, status: done }
  api: { in: platform, label: API v2, start: 2026-01, end: 2026-03, status: done }
  billing: { in: platform, label: Usage billing, start: 2026-04, end: 2026-07, status: active }
  eu: { in: platform, label: EU region, start: 2026-10, end: 2026-12, status: at-risk }
  web: { in: apps, label: Web editor, start: 2026-02, end: 2026-05 }
  ios: { in: mobile, label: iOS app, start: 2026-06, end: 2026-09, status: planned }
edges:
  - api -> billing
  - web -> ios
`;

describe("timeline dates", () => {
  it("floors days to the start of their period and steps to the next", () => {
    const d = dayOf("2026-05-20");
    expect(isoOf(floorTo(d, "month"))).toBe("2026-05-01");
    expect(isoOf(floorTo(d, "quarter"))).toBe("2026-04-01");
    expect(isoOf(floorTo(d, "year"))).toBe("2026-01-01");
    // 2026-05-20 is a Wednesday; weeks start on Monday.
    expect(isoOf(floorTo(d, "week"))).toBe("2026-05-18");
    expect(isoOf(nextOf(dayOf("2026-11-01"), "quarter"))).toBe("2027-02-01");
    expect(isoOf(nextOf(dayOf("2026-12-01"), "month"))).toBe("2027-01-01");
  });

  it("places a span from its first day to the day after its last, a point mid-period", () => {
    const bar = spanOf({ start: "2026-01-01", end: "2026-03-31", precision: "month" });
    expect([isoOf(bar.t0), isoOf(bar.t1), bar.point]).toEqual(["2026-01-01", "2026-04-01", false]);
    const day = spanOf({ start: "2026-03-16", precision: "day" });
    expect(day.t0).toBe(dayOf("2026-03-16") + 0.5);
    const june = spanOf({ start: "2026-06-01", precision: "month" });
    expect(june.t0).toBe(dayOf("2026-06-01") + 15);
  });
});

describe("timeline axis", () => {
  it("ticks quarters under a year tier, with months as minor ticks", async () => {
    const s = await scene(ROADMAP);
    const { axis } = tl(s);
    expect(axis.scale).toBe("quarter");
    expect(axis.ticks.map((t) => t.name)).toEqual(["Q1 2026", "Q2 2026", "Q3 2026", "Q4 2026"]);
    expect(axis.ticks.map((t) => t.label.lines[0])).toEqual(["Q1", "Q2", "Q3", "Q4"]);
    expect(axis.periods.map((p) => p.label?.lines[0])).toEqual(["2026"]);
    expect(axis.minor).toHaveLength(8);
    expect([axis.start, axis.end]).toEqual(["2026-01-01", "2026-12-31"]);
    // Every column is one pitch wide and they tile the axis band.
    for (const [i, t] of axis.ticks.entries())
      expect(t.x).toBeCloseTo(axis.box.x + i * axis.pitch, 1);
  });

  it("fits a year of months into a README column", async () => {
    const s = await scene(`kind: timeline
timeline: { scale: month }
nodes:
  a: { label: Alpha, start: 2026-01-12, end: 2026-04-03 }
  b: { label: Beta, start: 2026-06, end: 2026-12-20 }
`);
    const { axis } = tl(s);
    expect(axis.ticks).toHaveLength(12);
    expect(axis.ticks[0]?.label.lines[0]).toBe("Jan");
    expect(axis.periods.map((p) => p.name)).toEqual(["2026"]);
    expect(s.width).toBeLessThanOrEqual(880);
    expect(axis.pitch).toBeGreaterThan(50);
    // No weeks under months: they would fall unevenly.
    expect(axis.minor).toEqual([]);
  });

  it("pads the axis to whole periods around the items, and keeps the spec's bounds", async () => {
    const padded = tl(
      await scene(`kind: timeline
nodes:
  a: { label: A, start: 2026-02-10, end: 2026-03-05 }
`),
    ).axis;
    expect([padded.start, padded.end, padded.ticks.length]).toEqual([
      "2026-02-01",
      "2026-03-31",
      2,
    ]);
    const bounded = tl(
      await scene(`kind: timeline
timeline: { scale: quarter, start: 2026-Q2, end: 2026-Q3 }
nodes:
  a: { label: A, start: 2026-05, end: 2026-06 }
`),
    ).axis;
    expect(bounded.ticks.map((t) => t.name)).toEqual(["Q2 2026", "Q3 2026"]);
  });

  it("prints years alone on a year axis, months over weeks and over days", async () => {
    const years = tl(
      await scene(`kind: timeline
timeline: { scale: year }
nodes:
  a: { label: A, start: 2024, end: 2026 }
`),
    ).axis;
    expect(years.ticks.map((t) => t.label.lines[0])).toEqual(["2024", "2025", "2026"]);
    expect(years.upper).toBeUndefined();
    expect(years.minor).toHaveLength(9);

    const weeks = tl(
      await scene(`kind: timeline
timeline: { scale: week }
nodes:
  a: { label: A, start: 2026-03-04, end: 2026-03-20 }
`),
    ).axis;
    expect(weeks.ticks.map((t) => t.date)).toEqual(["2026-03-02", "2026-03-09", "2026-03-16"]);
    expect(weeks.ticks.map((t) => t.label.lines[0])).toEqual(["2", "9", "16"]);
    expect(weeks.periods.map((p) => p.name)).toEqual(["Mar 2026"]);

    const days = tl(
      await scene(`kind: timeline
timeline: { scale: day }
nodes:
  a: { label: A, start: 2026-03-30, end: 2026-04-02 }
`),
    ).axis;
    expect(days.ticks.map((t) => t.label.lines[0])).toEqual(["30", "31", "1", "2"]);
    expect(days.periods.map((p) => p.name)).toEqual(["Mar 2026", "Apr 2026"]);
  });
});

describe("timeline items", () => {
  it("draws a bar from its start to its end and a point at its date", async () => {
    const s = await scene(ROADMAP);
    const { axis } = tl(s);
    const q = (i: number) => must(axis.ticks[i], `tick ${i}`).x;
    const api = item(s, "api");
    expect(api.shape).toBe("bar");
    expect(api.x0).toBeCloseTo(q(0) + 2, 1);
    expect(api.x1).toBeCloseTo(q(1) - 2, 1);
    const billing = item(s, "billing");
    // April 1 to July 31: the second column and a third of the third.
    expect(billing.x1).toBeCloseTo(q(2) + (31 / 92) * axis.pitch - 2, 0);
    const beta = item(s, "beta");
    expect(beta.shape).toBe("milestone");
    expect(beta.x0).toBeCloseTo(
      q(0) + ((dayOf("2026-03-16") + 0.5 - dayOf("2026-01-01")) / 90) * axis.pitch,
      0,
    );
    expect(node(s, "beta").shape).toBe("diamond");
    expect(node(s, "api").look).toBe("icon");
  });

  it("puts a label inside its bar when it fits, else beside it, and toward the axis inside", async () => {
    const s = await scene(`kind: timeline
timeline: { scale: month, start: 2026-01, end: 2026-06 }
nodes:
  wide: { label: Wide bar, start: 2026-01, end: 2026-03 }
  short: { label: A rather long label, start: 2026-04-01, end: 2026-04-06 }
  last: { label: Right at the end, date: 2026-06-28 }
`);
    const wide = node(s, "wide");
    expect(item(s, "wide").side).toBe("inside");
    expect(wide.labelBox.x).toBeGreaterThan(wide.box.x);
    expect(wide.labelBox.x + wide.labelBox.w).toBeLessThan(wide.box.x + wide.box.w);
    const short = node(s, "short");
    expect(item(s, "short").side).toBe("right");
    expect(short.labelBox.x).toBeGreaterThan(short.box.x + short.box.w);
    const last = node(s, "last");
    expect(item(s, "last").side).toBe("left");
    expect(last.labelBox.x + last.labelBox.w).toBeLessThan(last.box.x);
  });

  it("stacks close dates in rows so no two labels touch, and reports the depth", async () => {
    const s = await scene(`kind: timeline
timeline: { scale: month }
nodes:
  p1: { label: First release, date: 2026-05-02 }
  p2: { label: Second release, date: 2026-05-04 }
  p3: { label: Third release, date: 2026-05-06 }
  p4: { label: Fourth release, date: 2026-05-08 }
  p5: { label: Later, date: 2026-09-20 }
`);
    const ids = ["p1", "p2", "p3", "p4", "p5"];
    for (const a of ids)
      for (const b of ids) if (a < b) expect(overlap(footprint(s, a), footprint(s, b))).toBe(false);
    const lane = must(tl(s).lanes[0], "lane");
    expect(lane.tracks.length).toBe(4);
    expect(lane.stack).toBe(4);
    expect(item(s, "p5").track).toBe(0);
  });

  it("keeps one lane per top-level group, the ungrouped items first", async () => {
    const s = await scene(ROADMAP);
    const lanes = tl(s).lanes;
    expect(lanes.map((l) => l.id)).toEqual(["", "platform", "apps"]);
    expect(lanes.map((l) => l.label?.lines.join(" "))).toEqual(["Milestones", "Platform", "Apps"]);
    // Nested groups ride in their top-level lane.
    expect(item(s, "ios").lane).toBe(2);
    // Bands stack top to bottom without overlapping, and every item sits in its lane's band.
    for (let i = 1; i < lanes.length; i++) {
      const a = must(lanes[i - 1], "lane").box;
      const b = must(lanes[i], "lane").box;
      expect(b.y).toBeGreaterThanOrEqual(a.y + a.h);
    }
    for (const it of tl(s).items) {
      const band = must(lanes[it.lane], "lane").box;
      expect(it.box.y).toBeGreaterThanOrEqual(band.y);
      expect(it.box.y + it.box.h).toBeLessThanOrEqual(band.y + band.h);
    }
  });

  it("chains a dependency along one row when the arrow has room", async () => {
    const s = await scene(`kind: timeline
timeline: { scale: month }
nodes:
  a: { label: Design, start: 2026-01, end: 2026-02 }
  b: { label: Other, start: 2026-02-15, end: 2026-03-20 }
  c: { label: Build, start: 2026-04, end: 2026-05 }
edges:
  - a -> c
`);
    expect(item(s, "c").track).toBe(item(s, "a").track);
    const e = must(s.edges[0], "edge");
    expect(e.points).toHaveLength(2);
    expect(must(e.points[0], "start").y).toBe(must(e.points[1], "end").y);
  });
});

describe("timeline today and dependencies", () => {
  it("marks today between its ticks and breaks the line around text", async () => {
    const s = await scene(ROADMAP);
    const today = must(tl(s).today, "today");
    const { ticks } = tl(s).axis;
    const q2 = must(ticks[1], "Q2");
    expect(today.x).toBeGreaterThan(q2.x);
    expect(today.x).toBeLessThan(q2.x + q2.w);
    expect(today.date).toBe("2026-05-18");
    const texts = [...ticks.map((t) => t.labelBox), ...s.nodes.map((n) => n.labelBox)];
    for (const sg of today.segments)
      for (const b of texts)
        if (today.x >= b.x && today.x <= b.x + b.w)
          expect(sg.y1 <= b.y || sg.y0 >= b.y + b.h).toBe(true);
    const outside = await scene(ROADMAP.replace("today: 2026-05-18", "today: 2027-03-01"));
    expect(tl(outside).today).toBeUndefined();
  });

  it("routes each dependency from its source's end to its target, clear of other items", async () => {
    const s = await scene(ROADMAP);
    expect(s.edges.map((e) => `${e.from}>${e.to}`)).toEqual(["api>billing", "web>ios"]);
    for (const e of s.edges) {
      const pts = e.points;
      const first = must(pts[0], "first");
      const last = must(pts[pts.length - 1], "last");
      expect(onBorder(first, node(s, e.from).box)).toBe(true);
      expect(onBorder(last, node(s, e.to).box)).toBe(true);
      for (let i = 1; i < pts.length; i++) {
        const p = must(pts[i - 1], "p");
        const q = must(pts[i], "q");
        expect(p.x === q.x || p.y === q.y).toBe(true);
        for (const nd of s.nodes) {
          if (nd.id === e.from || nd.id === e.to) continue;
          expect(crosses(p, q, nd.box)).toBe(false);
          expect(crosses(p, q, nd.labelBox)).toBe(false);
        }
      }
      // Finish to start: it leaves at or near the end of the source bar.
      const src = node(s, e.from).box;
      expect(first.x).toBeGreaterThan(src.x + src.w / 2 - 1);
    }
  });
});

describe("timeline rendering", () => {
  it("draws bars that grow in time order, a pulsing today chip, and status styles", async () => {
    const s = await scene(ROADMAP);
    const svg = renderSvg(s, { idPrefix: "tl" });
    expect(svg).toContain('<animate attributeName="width"');
    expect(svg).toContain('attributeName="stroke-width"');
    expect(svg).toContain('stroke-dasharray="5 3"');
    expect(svg).toContain(RISK.light);
    expect(svg).toContain(">Today</tspan>");
    expect(xmlProblems(svg)).toEqual([]);
    // Bars start growing in the order of their start dates.
    const begins = [
      ...svg.matchAll(/attributeName="width" values="0;0;[\d.]+[^"]*" keyTimes="0;([\d.]+);/g),
    ].map((m) => Number(m[1]));
    const order = tl(s)
      .items.filter((x) => x.shape === "bar")
      .map((x) => x.x0);
    const sorted = [...order].sort((a, b) => a - b);
    const byX = sorted.map((x) => begins[order.indexOf(x)] ?? 0);
    expect(byX).toEqual([...byX].sort((a, b) => a - b));
    // Every id the timeline adds keeps the scene's prefix.
    for (const m of svg.matchAll(/ id="([^"]+)"/g)) expect(m[1]?.startsWith("tl-")).toBe(true);
  });

  it("draws the finished frame when still", async () => {
    const s = await scene(ROADMAP);
    const still = renderSvg({ ...s, animate: "none" });
    expect(still).not.toContain("<animate");
    expect(still).toContain(`width="${item(s, "api").box.w}"`);
  });

  it("draws the stage skin from the stage kit, in both themes", async () => {
    for (const theme of ["dark", "light"] as const) {
      const s = await scene(ROADMAP.replace("skin: classic", "skin: stage"), theme);
      const k = must(tokensFor(s).stage, "stage kit");
      const svg = renderSvg(s, { idPrefix: `st${theme}` });
      expect(svg).toContain(`fill="${k.tile}"`);
      expect(svg).toContain(`stroke="${k.tint}"`);
      expect(svg).toContain(">TODAY</tspan>");
      expect(xmlProblems(svg)).toEqual([]);
    }
  });

  it("lays out the same scene every time", async () => {
    const a = await scene(ROADMAP);
    const b = await scene(ROADMAP);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(renderSvg(a)).toBe(renderSvg(b));
  });
});

describe("timeline exports", () => {
  it("writes a Mermaid gantt: sections per lane, status tags, milestones and after", () => {
    const out = timelineMermaid(model(ROADMAP));
    expect(out.split("\n")).toEqual([
      "gantt",
      "  title Roadmap",
      "  dateFormat YYYY-MM-DD",
      "  inclusiveEndDates",
      "  axisFormat %b %Y",
      "  tickInterval 3month",
      "  section Milestones",
      "    Beta :done, milestone, beta, 2026-03-16, 0d",
      "  section Platform",
      "    API v2 :done, api, 2026-01-01, 2026-03-31",
      "    Usage billing :active, billing, after api, 2026-07-31",
      "    EU region :crit, eu, 2026-10-01, 2026-12-31",
      "  section Apps",
      "    Web editor :web, 2026-02-01, 2026-05-31",
      "    iOS app :ios, after web, 2026-09-30",
      "",
    ]);
  });

  it("escapes names that would read as gantt syntax", () => {
    const out = timelineMermaid(
      model(`kind: timeline
nodes:
  after: { label: "Phase 1: build #2", start: 2026-01, end: 2026-02 }
`),
    );
    expect(out).toContain("    Phase 1#58; build #35;2 :t_after, 2026-01-01, 2026-02-28");
  });

  it("writes draw.io cells for the grid and an editable cell per item", async () => {
    const s = await scene(ROADMAP);
    const ctx: DrawioCtx = { t: tokensFor(s), scene: s, icons: 0, cells: [], groupBox: new Map() };
    const grid = timelineDrawio(ctx, s);
    expect(grid.length).toBeGreaterThan(20);
    for (const c of grid) expect(c).toMatch(/^<mxCell id="timeline:\d+"/);
    const ios = must(timelineItemDrawio(ctx, node(s, "ios")), "ios cell");
    expect(ios[0]).toContain('id="n-ios"');
    expect(ios[0]).toContain("dashed=1");
    const beta = must(timelineItemDrawio(ctx, node(s, "beta")), "beta cell");
    expect(beta[0]).toContain("rhombus");
    expect(beta[0]).toContain("labelPosition=right");
    expect(timelineItemDrawio(ctx, { ...node(s, "ios"), id: "nope" })).toBeUndefined();
    const file = renderDrawio({ ...s, animate: "none" }, "Roadmap");
    expect(xmlProblems(file)).toEqual([]);
    const ids = [...file.matchAll(/<mxCell id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("timeline review", () => {
  /** The findings measureTimeline adds for a spec, by id, with the metrics it returns. */
  async function measured(source: string) {
    const m = model(source);
    const s = must(await timelineLayout(m, "light"), "scene");
    const found: { id: string; severity: string; subjects: string[]; rule?: string }[] = [];
    const ctx = {
      scene: s,
      model: m,
      add: (id: string, severity: string, subjects: string[], ...rest: unknown[]) =>
        found.push({ id, severity, subjects, rule: rest[5] as string | undefined }),
    } as unknown as ReviewCtx;
    return { metrics: measureTimeline(ctx), found, scene: s, ctx };
  }

  it("measures undated items, dependencies against the dates and the axis bounds", async () => {
    const { metrics, found } = await measured(`kind: timeline
timeline: { scale: month, start: 2026-02, end: 2026-06 }
groups:
  a: { label: Team }
nodes:
  build: { in: a, label: Build, start: 2026-01, end: 2026-03 }
  ship: { in: a, label: Ship, start: 2026-03-15, end: 2026-04 }
  someday: { in: a, label: Someday }
  late: { in: a, label: Late, start: 2026-08, end: 2026-09 }
edges:
  - build -> ship
`);
    expect(metrics).toMatchObject({ undated: 1, outOfOrder: 1, outOfRange: 2 });
    const ids = found.map((f) => `${f.id}:${f.severity}:${f.subjects[0]}`);
    expect(ids).toContain("conventions.timeline-undated:major:someday");
    expect(ids).toContain("conventions.timeline-order:major:e1");
    expect(ids).toContain("conventions.timeline-range:minor:build");
    expect(ids).toContain("conventions.timeline-range:major:late");
    expect(found.every((f) => f.rule?.startsWith("TL-"))).toBe(true);
  });

  it("measures statuses with no key and point labels piled more than three deep", async () => {
    const {
      found,
      scene: s,
      ctx,
    } = await measured(`kind: timeline
nodes:
  p1: { label: First release, date: 2026-05-02, status: done }
  p2: { label: Second release, date: 2026-05-04 }
  p3: { label: Third release, date: 2026-05-06 }
  p4: { label: Fourth release, date: 2026-05-08 }
`);
    expect(found.map((f) => f.id)).toEqual(["conventions.timeline-crowded"]);
    // A scene drawn without the key leaves the statuses unexplained.
    const bare = { ...tl(s), key: undefined };
    const again: string[] = [];
    measureTimeline({
      ...ctx,
      scene: { ...s, timeline: bare },
      add: (id: string) => again.push(id),
    } as unknown as ReviewCtx);
    expect(again).toContain("conventions.timeline-legend");
  });

  it("passes the review at README width for every timeline example", async () => {
    for (const name of ["timeline-product-roadmap", "timeline-cloud-migration"]) {
      const file = join(EXAMPLES_DIR, `${name}.yaml`);
      const parsed = parseSpec(readFileSync(file, "utf8"), file);
      expect(parsed.diagnostics).toEqual([]);
      const run = await reviewModel({
        model: must(parsed.model, name),
        name,
        width: 880,
        png: false,
      });
      expect(run.report.pass, `${name}: ${run.report.findings.map((f) => f.id).join(", ")}`).toBe(
        true,
      );
      expect(run.report.hard).toMatchObject({
        overlaps: 0,
        edgesThroughNodes: 0,
        edgesThroughLabels: 0,
      });
    }
  });
});
