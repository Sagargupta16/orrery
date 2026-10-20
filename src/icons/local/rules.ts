// `orrery icons check`: the drawing rules IC01..IC10, each measured on the 24 grid.

import { type Drawing, drawingOf, type Part, partBox } from "./drawing.ts";
import { type Bad, badFor } from "./errors.ts";
import { type Box, subBox, union } from "./geometry.ts";
import { normalizeColor } from "./paint.ts";
import { localArt } from "./read.ts";
import { sanitize } from "./sanitize.ts";
import { parseXml } from "./xml.ts";

export interface IconRule {
  id: string;
  title: string;
  fix: string;
}

/** The drawing rules (references/icons.md has the full text); every check failure cites one. */
export const ICON_RULES: IconRule[] = [
  {
    id: "IC01",
    title: "24 grid with a 2 px safe area",
    fix: 'draw on viewBox="0 0 24 24" and keep every edge, stroke included, between 2 and 22 (`orrery icons adopt` refits a drawing)',
  },
  {
    id: "IC02",
    title: "one stroke weight",
    fix: "give every stroke the same stroke-width, 1.5 (1.25 to 2 passes), set once on the root",
  },
  {
    id: "IC03",
    title: "round caps and joins",
    fix: 'set stroke-linecap="round" and stroke-linejoin="round" on the root',
  },
  {
    id: "IC04",
    title: "currentColor only",
    fix: 'paint with currentColor and none only, and set fill="none" (line art) or fill="currentColor" on the root so nothing falls back to black',
  },
  {
    id: "IC05",
    title: "no text or letters; identity by geometry",
    fix: "show what the thing is with its shape (a fold, a cut, a handle), never letters; delete the <text>",
  },
  {
    id: "IC06",
    title: "two to six parts, silhouette first",
    fix: "draw one silhouette that reads alone, then one to five details; merge or drop the rest",
  },
  {
    id: "IC07",
    title: "optical size matches Tabler",
    fix: "scale the drawing so its larger side, stroke included, spans 16 to 20 of the 24 units, centered on 12,12",
  },
  {
    id: "IC08",
    title: "no detail under 1 px at 24",
    fix: "make every stroke and every filled part at least 1 unit; details smaller vanish at 24 px",
  },
  {
    id: "IC09",
    title: "adopt by rebuilding, never tracing",
    fix: "rebuild it from two to six simple paths; traced outlines carry hundreds of nodes and blur when small",
  },
  {
    id: "IC10",
    title: "check passes and the sheet was looked at",
    fix: "fix every rule above, then open the contact sheet and look at all four tiles before handing over",
  },
];

export interface RuleResult extends IconRule {
  ok: boolean;
  /** What failed, measured. */
  problems: string[];
  /** Context for a passing rule ("no strokes: filled artwork"). */
  note?: string;
}

/** Traced artwork runs to hundreds of commands; Tabler's busiest outline icon (3.49) has 56. */
export const MAX_COMMANDS = 80;
const TOL = 0.05;

const r2 = (x: number) => Math.round(x * 100) / 100;
const range = (a: number, b: number) => (r2(a) === r2(b) ? `${r2(a)}` : `${r2(a)} to ${r2(b)}`);

export interface IconCheck {
  results: RuleResult[];
  /** Painted bounds on the 24 grid: x0, y0, x1, y1. */
  box: [number, number, number, number];
  parts: number;
  commands: number;
  /** Distinct stroke widths on the 24 grid. */
  widths: number[];
}

/** A drawing as the rules see it. */
interface Measured {
  d: Drawing;
  /** Grid units per viewBox unit: 24 over the viewBox's larger side. */
  unit: number;
  to24: (b: Box) => Box;
  /** Painted bounds on the 24 grid. */
  painted: Box;
  stroked: Part[];
}

/** Each rule's problems and note, filled by the rule steps in rule order. */
type Findings = Record<string, { problems: string[]; note?: string }>;

interface Verdicts {
  fail: (id: string, problem: string) => void;
  note: (id: string, text: string) => void;
}

function measure(d: Drawing, bad: Bad): Measured {
  const [vx, vy, vw, vh] = d.viewBox;
  // Rules are written for the 24 grid; other grids are measured as if scaled to it.
  const unit = 24 / Math.max(vw, vh);
  const to24 = (b: Box): Box => [
    (b[0] - vx) * unit,
    (b[1] - vy) * unit,
    (b[2] - vx) * unit,
    (b[3] - vy) * unit,
  ];
  let painted: Box | undefined;
  for (const p of d.parts) {
    const b = partBox(p);
    if (b) painted = union(painted, to24(b));
  }
  if (!painted) throw bad("draws nothing visible", "draw two to six shapes on a 24 grid (IC06)");
  return { d, unit, to24, painted, stroked: d.parts.filter((p) => p.stroked) };
}

function ic01Grid({ d, painted }: Measured, v: Verdicts): void {
  const [vx, vy, vw, vh] = d.viewBox;
  if (vx !== 0 || vy !== 0 || vw !== 24 || vh !== 24)
    v.fail("IC01", `viewBox is "${d.viewBox.join(" ")}", not "0 0 24 24"`);
  if (
    painted[0] < 2 - TOL ||
    painted[1] < 2 - TOL ||
    painted[2] > 22 + TOL ||
    painted[3] > 22 + TOL
  )
    v.fail(
      "IC01",
      `the drawing reaches x ${range(painted[0], painted[2])}, y ${range(painted[1], painted[3])}; the safe area is 2 to 22`,
    );
}

/** IC02; returns the distinct stroke widths on the 24 grid. */
function ic02StrokeWeight({ unit, stroked }: Measured, v: Verdicts): number[] {
  const widths = [...new Set(stroked.map((p) => r2(p.width * unit)))].sort((a, b) => a - b);
  if (widths.length > 1) v.fail("IC02", `${widths.length} stroke widths: ${widths.join(", ")}`);
  else if (widths[0] !== undefined && (widths[0] < 1.25 - TOL || widths[0] > 2 + TOL))
    v.fail("IC02", `stroke-width is ${widths[0]} on the 24 grid`);
  if (!stroked.length) v.note("IC02", "no strokes: filled artwork");
  return widths;
}

function ic03RoundCaps({ stroked }: Measured, v: Verdicts): void {
  const caps = stroked.filter((p) => p.cap !== "round");
  const joins = stroked.filter((p) => p.join !== "round");
  if (caps.length) v.fail("IC03", `${caps.length} stroke(s) end ${caps[0]?.cap} instead of round`);
  if (joins.length)
    v.fail("IC03", `${joins.length} stroke(s) join ${joins[0]?.join} instead of round`);
  if (!stroked.length) v.note("IC03", "no strokes");
}

function ic04CurrentColor({ d }: Measured, v: Verdicts): void {
  const unset = d.parts.filter((p) => p.filled && p.fill === undefined).length;
  if (unset) v.fail("IC04", `${unset} shape(s) set no fill, so they draw black`);
  const other = new Set<string>();
  for (const p of d.parts) {
    if (p.filled && p.fill !== undefined && normalizeColor(p.fill) !== "currentColor")
      other.add(p.fill);
    if (p.stroked && normalizeColor(p.stroke ?? "") !== "currentColor") other.add(p.stroke ?? "");
  }
  if (other.size) v.fail("IC04", `paints with ${[...other].slice(0, 4).join(", ")}`);
}

function ic05NoText({ d }: Measured, v: Verdicts): void {
  if (d.texts) v.fail("IC05", `${d.texts} text element(s)`);
}

/** IC06: holes and details both count; a lone moveto draws nothing. Returns the part count. */
function ic06Parts({ d }: Measured, v: Verdicts): number {
  const parts = d.parts.reduce((n, p) => n + p.subs.filter((s) => s.segs.length).length, 0);
  if (parts < 2 || parts > 6) v.fail("IC06", `${parts} part(s)`);
  return parts;
}

function ic07OpticalSize({ painted }: Measured, v: Verdicts): void {
  const side = Math.max(painted[2] - painted[0], painted[3] - painted[1]);
  const cx = (painted[0] + painted[2]) / 2;
  const cy = (painted[1] + painted[3]) / 2;
  if (side < 16 - TOL || side > 20 + TOL) v.fail("IC07", `the larger side spans ${r2(side)} units`);
  if (Math.hypot(cx - 12, cy - 12) > 1.5)
    v.fail(
      "IC07",
      `the drawing is centered at ${r2(cx)},${r2(cy)}, ${r2(Math.hypot(cx - 12, cy - 12))} units off 12,12`,
    );
}

function ic08Detail({ d, unit, to24, stroked }: Measured, v: Verdicts): void {
  const thin = stroked.filter((p) => p.width * unit < 1 - TOL);
  if (thin.length) v.fail("IC08", `${thin.length} stroke(s) thinner than 1 unit`);
  let tiny = 0;
  for (const p of d.parts)
    for (const s of p.subs) {
      if (!s.segs.length) continue;
      const b = to24(subBox(s));
      const extent = Math.max(b[2] - b[0], b[3] - b[1]);
      // A dot (a zero-length stroke with round caps) is a deliberate detail.
      if (p.stroked ? extent > TOL && extent < 1 - TOL : extent < 1 - TOL) tiny += 1;
    }
  if (tiny) v.fail("IC08", `${tiny} detail(s) smaller than 1 unit`);
}

/** IC09; returns the drawing command count. */
function ic09NotTraced({ d }: Measured, v: Verdicts): number {
  const commands = d.parts.reduce((n, p) => n + p.subs.reduce((m, s) => m + s.cmds, 0), 0);
  if (commands > MAX_COMMANDS)
    v.fail(
      "IC09",
      `${commands} drawing commands; traced outlines run to hundreds, a drawn icon stays under ${MAX_COMMANDS}`,
    );
  return commands;
}

/** Every rule's verdict in rule order; IC10 passes only with all the others. */
function resultsOf(out: Findings): RuleResult[] {
  const results = ICON_RULES.map((r) => {
    const o = out[r.id] ?? { problems: [] };
    return {
      ...r,
      ok: !o.problems.length,
      problems: o.problems,
      ...(o.note ? { note: o.note } : {}),
    };
  });
  const last = results[results.length - 1];
  if (last && results.slice(0, -1).some((r) => !r.ok)) {
    last.ok = false;
    last.problems.push("the rules above do not all pass yet");
  }
  return results;
}

/** Measures a drawing against IC01..IC10. Throws LocalIconError when the file is unusable. */
export function checkIcon(text: string, file: string): IconCheck {
  const bad = badFor(file);
  // The loader's own checks first: an icon that cannot load cannot pass.
  localArt(text, file);
  const root = sanitize(parseXml(text, bad), bad);
  const m = measure(drawingOf(root, bad), bad);
  const out: Findings = {};
  for (const r of ICON_RULES) out[r.id] = { problems: [] };
  const v: Verdicts = {
    fail: (id, problem) => out[id]?.problems.push(problem),
    note: (id, text) => {
      const o = out[id];
      if (o) o.note = text;
    },
  };
  ic01Grid(m, v);
  const widths = ic02StrokeWeight(m, v);
  ic03RoundCaps(m, v);
  ic04CurrentColor(m, v);
  ic05NoText(m, v);
  const parts = ic06Parts(m, v);
  ic07OpticalSize(m, v);
  ic08Detail(m, v);
  const commands = ic09NotTraced(m, v);
  return { results: resultsOf(out), box: m.painted.map(r2) as Box, parts, commands, widths };
}
