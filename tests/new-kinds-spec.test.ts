import { describe, expect, it } from "vitest";
import { renderModel } from "../src/render/index.ts";
import { parseSpec } from "../src/spec/index.ts";
import { readDate } from "../src/spec/kinds.ts";
import type { Diagnostic, Skin } from "../src/types.ts";
import { listDiagnostics, model, must } from "./helpers.ts";

/** Every diagnostic with `code`; fails with everything that was reported when there is none. */
function findings(source: string, code: string): Diagnostic[] {
  const result = parseSpec(source, "bad.yaml");
  const found = result.diagnostics.filter((d) => d.code === code);
  if (!found.length)
    throw new Error(`no ${code}; got:\n${listDiagnostics(result.diagnostics) || "(none)"}`);
  return found;
}

const errorsOf = (source: string) =>
  parseSpec(source, "bad.yaml").diagnostics.filter((d) => d.severity === "error");

// ---------------------------------------------------------------- kinds

describe("the three kinds", () => {
  it.each([
    ["er", "right", "open"],
    ["sequence", "down", "filled"],
    ["timeline", "right", "open"],
  ])("kind %s defaults to direction %s and %s arrowheads", (kind, direction, arrowhead) => {
    const m = model(`kind: ${kind}\nnodes: { a: A }\n`);
    expect(m.kind).toBe(kind);
    expect(m.direction).toBe(direction);
    expect(m.arrowhead).toBe(arrowhead);
  });
});

// ---------------------------------------------------------------- er

const ER = (fields: string, edge = "") =>
  `kind: er\nnodes:\n  users: { fields: ${fields} }\n  teams: { fields: ["id uuid pk", "name text"] }\n${edge}`;

describe("er fields", () => {
  it("reads the string form: name, type, then flags in any order", () => {
    const m = model(
      ER(
        '["id uuid pk", "email text unique", "team_id uuid fk", "bio text null", "code pk", "x uuid fk pk"]',
      ),
    );
    expect(m.nodes[0]?.fields).toEqual([
      { name: "id", type: "uuid", pk: true },
      { name: "email", type: "text", unique: true },
      { name: "team_id", type: "uuid", fk: true },
      { name: "bio", type: "text", nullable: true },
      { name: "code", pk: true },
      { name: "x", type: "uuid", fk: true, pk: true },
    ]);
  });

  it("reads the mapping form, a type with spaces included", () => {
    const m = model(
      ER(
        '[{ name: created, type: "timestamp with time zone", nullable: true, note: set on insert }, { name: id, pk: true }]',
      ),
    );
    expect(m.nodes[0]?.fields).toEqual([
      { name: "created", type: "timestamp with time zone", nullable: true, note: "set on insert" },
      { name: "id", pk: true },
    ]);
  });

  it("keeps entities as cards, so shared code treats them as boxes", () => {
    const m = model(ER('["id uuid pk"]'));
    expect(m.nodes.map((n) => n.look)).toEqual(["card", "card"]);
  });

  it("allows more than one pk (a composite key)", () => {
    expect(model(ER('["a uuid pk fk", "b uuid pk fk"]')).nodes[0]?.fields?.length).toBe(2);
  });

  it.each([
    ['["id uuid primary"]', /unknown token "primary"/],
    ['["id uuid pk", "id text"]', /lists "id" twice/],
    ['["id uuid", "ID text"]', /lists "ID" twice/],
    ['[""]', /needs a name/],
    ["[{ type: uuid }]", /needs a name/],
    ["[{ name: id, pk: yes }]", /pk must be true or false/],
    ["id uuid pk", /must be a list/],
  ])("fields %s is DG123", (fields, message) => {
    const [d] = findings(ER(fields), "DG123");
    expect(d?.severity).toBe("error");
    expect(d?.message).toMatch(message);
    expect(d?.fixes?.length).toBeGreaterThan(0);
  });

  it("suggests the closest flag for a typo", () => {
    const [d] = findings(ER('["id uuid uniqe"]'), "DG123");
    expect(d?.fixes?.[0]).toBe('use "unique"');
  });

  it("an unknown key in a field mapping is DG108", () => {
    findings(ER("[{ name: id, primary: true }]"), "DG108");
  });

  it("fields outside kind: er is DG123", () => {
    const [d] = findings('nodes: { a: { fields: ["id uuid pk"] } }\n', "DG123");
    expect(d?.message).toMatch(/only applies to kind: er/);
    expect(d?.fixes?.[0]).toMatch(/kind: er/);
  });
});

describe("er card and field ends", () => {
  it.each([
    ["1:n", { from: "one", to: "many" }],
    ["1:1", { from: "one", to: "one" }],
    ["0..1:1..n", { from: "zero-one", to: "many" }],
    ["1:0..n", { from: "one", to: "zero-many" }],
    ["n:*", { from: "many", to: "zero-many" }],
    ["1..*:0..*", { from: "many", to: "zero-many" }],
    [" 1 : N ", { from: "one", to: "many" }],
  ])("card %s reads as %o", (card, ends) => {
    const m = model(ER('["id uuid pk"]', `edges:\n  - teams -> users: { card: "${card}" }\n`));
    expect(m.edges[0]?.card).toEqual(ends);
  });

  it("names the field rows each end attaches to", () => {
    const m = model(
      ER(
        '["id uuid pk", "team_id uuid fk"]',
        "edges:\n  - teams -> users: { card: '1:n', from_field: id, to_field: team_id }\n",
      ),
    );
    expect(m.edges[0]).toMatchObject({ fromField: "id", toField: "team_id" });
  });

  it("an edge drawn the other way swaps its ends, so card reads as written", () => {
    const m = model(
      ER(
        '["id uuid pk", "team_id uuid fk"]',
        "edges:\n  - users <- teams: { card: '0..1:n', from_field: team_id, to_field: id }\n",
      ),
    );
    expect(m.edges[0]).toMatchObject({
      from: "teams",
      to: "users",
      card: { from: "many", to: "zero-one" },
      fromField: "id",
      toField: "team_id",
    });
  });

  it.each(["1-n", "1:2", "many:1", "1"])("card %s is DG124", (card) => {
    const [d] = findings(
      ER('["id uuid pk"]', `edges:\n  - teams -> users: { card: "${card}" }\n`),
      "DG124",
    );
    expect(d?.severity).toBe("error");
    expect(d?.message).toMatch(/card must be "A:B"/);
  });

  it("a from_field that names no field of its end is DG124, with the closest", () => {
    const [d] = findings(
      ER('["id uuid pk", "team_id uuid fk"]', "edges:\n  - teams -> users: { to_field: teamid }\n"),
      "DG124",
    );
    expect(d?.message).toMatch(/to_field "teamid" is not a field of "users"/);
    expect(d?.fixes?.[0]).toBe("use to_field: team_id");
  });

  it("card outside kind: er is DG124", () => {
    const [d] = findings("nodes: { a: A, b: B }\nedges:\n  - a -> b: { card: '1:n' }\n", "DG124");
    expect(d?.message).toMatch(/only applies to kind: er/);
  });
});

// ---------------------------------------------------------------- sequence

const SEQ = (fragments: string, edges = 5) =>
  `kind: sequence\nnodes: { web: Web, api: API, db: DB }\nedges:\n${[
    "web -> api: GET",
    "api -> api: validate",
    "api -> db: select",
    "db --> api: rows",
    "api --> web: 200",
    "web ..> api: ping",
  ]
    .slice(0, edges)
    .map((e) => `  - ${e}\n`)
    .join("")}${fragments ? `fragments:\n${fragments}` : ""}`;

describe("sequence messages and fragments", () => {
  it("allows a self message", () => {
    const m = model(SEQ(""));
    expect(m.edges[1]).toMatchObject({ from: "api", to: "api", label: "validate" });
  });

  it("reads fragments with branches", () => {
    const m = model(
      SEQ(
        "  - { type: alt, label: cached, from: 2, to: 4, else: [{ at: 3, label: miss }, { at: 4 }] }\n  - { type: LOOP, from: 1, to: 5 }\n  - { type: opt, from: 2, to: 2 }\n",
      ),
    );
    expect(m.fragments).toEqual([
      { type: "alt", label: "cached", from: 2, to: 4, else: [{ at: 3, label: "miss" }, { at: 4 }] },
      { type: "loop", from: 1, to: 5 },
      { type: "opt", from: 2, to: 2 },
    ]);
  });

  it.each([
    ["  - { type: lop, from: 1, to: 2 }\n", /type must be one of/],
    ["  - { from: 1, to: 2 }\n", /needs a type/],
    ["  - { type: loop, from: 0, to: 2 }\n", /message numbers from 1 to 5/],
    ["  - { type: loop, from: 2, to: 6 }\n", /message numbers from 1 to 5/],
    ["  - { type: loop, from: 1.5, to: 2 }\n", /message numbers/],
    ["  - { type: loop, from: 4, to: 2 }\n", /starts at message 4, after its end at 2/],
    ["  - { type: loop, from: 1, to: 3, else: [{ at: 2 }] }\n", /only alt and par have else/],
    [
      "  - { type: alt, from: 2, to: 4, else: [{ at: 2 }] }\n",
      /else at must be a message from 3 to 4/,
    ],
    ["  - { type: alt, from: 2, to: 4, else: [{ at: 5 }] }\n", /else at must be/],
    ["  - { type: par, from: 1, to: 5, else: [{ at: 3 }, { at: 3 }] }\n", /each branch after/],
    ["  - { type: alt, from: 2, to: 4, else: 3 }\n", /else must be a list/],
    [
      "  - { type: loop, from: 1, to: 3 }\n  - { type: opt, from: 2, to: 4 }\n",
      /overlap without one inside the other/,
    ],
    ["  - loop\n", /must be a mapping/],
  ])("fragment %s is DG125", (fragments, message) => {
    const [d] = findings(SEQ(fragments), "DG125");
    expect(d?.severity).toBe("error");
    expect(d?.message).toMatch(message);
  });

  it("fragments must be a list", () => {
    expect(findings(`${SEQ("")}fragments: { type: loop }\n`, "DG125")[0]?.message).toMatch(
      /must be a list/,
    );
  });

  it("nested fragments and fragments that share a range are fine", () => {
    expect(
      errorsOf(
        SEQ(
          "  - { type: loop, from: 1, to: 5 }\n  - { type: opt, from: 2, to: 3 }\n  - { type: break, from: 2, to: 3 }\n",
        ),
      ),
    ).toEqual([]);
  });

  it("fragments outside kind: sequence is DG125", () => {
    const [d] = findings(
      "nodes: { a: A, b: B }\nedges:\n  - a -> b\nfragments:\n  - { type: loop, from: 1, to: 1 }\n",
      "DG125",
    );
    expect(d?.message).toMatch(/only applies to kind: sequence/);
  });
});

// ---------------------------------------------------------------- timeline

describe("timeline dates", () => {
  it.each([
    [2026, "2026-01-01", "2026-12-31", "year"],
    ["2026", "2026-01-01", "2026-12-31", "year"],
    ["2026-Q1", "2026-01-01", "2026-03-31", "quarter"],
    ["2026-Q3", "2026-07-01", "2026-09-30", "quarter"],
    ["2026-q4", "2026-10-01", "2026-12-31", "quarter"],
    ["2026-11", "2026-11-01", "2026-11-30", "month"],
    ["2028-02", "2028-02-01", "2028-02-29", "month"],
    ["2027-02", "2027-02-01", "2027-02-28", "month"],
    ["2026-11-05", "2026-11-05", "2026-11-05", "day"],
  ])("%s runs from %s to %s (%s)", (value, first, last, precision) => {
    expect(readDate(value)).toEqual({ first, last, precision });
  });

  it.each([
    "2026-13",
    "2026-02-30",
    "2026-Q5",
    "26",
    "2026/11",
    "2026-1",
    "next year",
    2026.5,
    true,
  ])("%s is no date", (value) => {
    expect(readDate(value)).toBeUndefined();
  });

  const TL = (node: string, top = "") =>
    `kind: timeline\n${top}nodes:\n  a: { label: A, ${node} }\n`;

  it.each([
    ["date: 2026", { start: "2026-01-01", precision: "year" }],
    ["date: 2026-Q3", { start: "2026-07-01", precision: "quarter" }],
    ["date: 2026-11", { start: "2026-11-01", precision: "month" }],
    ["date: 2026-11-05", { start: "2026-11-05", precision: "day" }],
    ["start: 2026, end: 2027", { start: "2026-01-01", end: "2027-12-31", precision: "year" }],
    [
      "start: 2026-Q3, end: 2026-Q4",
      { start: "2026-07-01", end: "2026-12-31", precision: "quarter" },
    ],
    [
      "start: 2026-11, end: 2026-11",
      { start: "2026-11-01", end: "2026-11-30", precision: "month" },
    ],
    [
      "start: 2026-11-05, end: 2026-11-05",
      { start: "2026-11-05", end: "2026-11-05", precision: "day" },
    ],
    // A span is read to the finer of its two ends.
    [
      "start: 2026-Q3, end: 2026-11-05",
      { start: "2026-07-01", end: "2026-11-05", precision: "day" },
    ],
    ["start: 2026, end: 2026-11", { start: "2026-01-01", end: "2026-11-30", precision: "month" }],
  ])("%s reads as %o", (keys, when) => {
    expect(model(TL(keys)).nodes[0]?.when).toEqual(when);
  });

  it("reads milestone and status", () => {
    const n = model(TL("date: 2026-09, milestone: true, status: at-risk")).nodes[0];
    expect(n).toMatchObject({ milestone: true, status: "at-risk" });
  });

  it.each([
    ["date: 2026-13", /date must be a date/],
    ["start: 2026-Q5, end: 2026-Q4", /start must be a date/],
    ["start: 2026-11, end: 2026-10", /ends \(2026-10-31\) before it starts \(2026-11-01\)/],
    ["start: 2027, end: 2026-Q4", /ends .* before it starts/],
    ["date: 2026, start: 2026-01, end: 2026-02", /both date and start\/end/],
    ["start: 2026-01", /has start but no end/],
    ["end: 2026-01", /has end but no start/],
  ])("%s is a DG126 error", (keys, message) => {
    const [d] = findings(TL(keys), "DG126");
    expect(d?.severity).toBe("error");
    expect(d?.message).toMatch(message);
  });

  it("an end on the day its start begins is fine", () => {
    expect(errorsOf(TL("start: 2026-11-30, end: 2026-11"))).toEqual([]);
  });

  it("an item with no date is a DG126 warning", () => {
    const result = parseSpec(TL("status: planned"), "t.yaml");
    expect(result.model).toBeDefined();
    const [d] = result.diagnostics.filter((x) => x.code === "DG126");
    expect(d).toMatchObject({ severity: "warning", subject: { node: "a" } });
  });

  it("a bad status is DG107 and a bad milestone DG107", () => {
    expect(findings(TL("date: 2026, status: late"), "DG107")[0]?.message).toMatch(/status/);
    expect(findings(TL("date: 2026, milestone: yes"), "DG107")[0]?.message).toMatch(/milestone/);
  });

  it("reads the axis, with bounds normalized like items", () => {
    const m = model(
      TL("date: 2026", "timeline: { scale: quarter, start: 2026, end: 2027-Q2, today: 2026-10 }\n"),
    );
    expect(m.timeline).toEqual({
      scale: "quarter",
      start: "2026-01-01",
      end: "2027-06-30",
      today: "2026-10-01",
    });
  });

  it("every timeline gets an axis, by month unless it says otherwise", () => {
    expect(model(TL("date: 2026")).timeline).toEqual({ scale: "month" });
    expect(model("nodes: { a: A }\n").timeline).toBeUndefined();
  });

  it.each([
    ["timeline: { scale: months }\n", /scale must be one of/],
    ["timeline: { start: 2026-13 }\n", /timeline.start must be a date/],
    ["timeline: { start: 2027, end: 2026 }\n", /timeline ends .* before it starts/],
    ["timeline: monthly\n", /must be a mapping/],
  ])("%s is DG126", (top, message) => {
    const [d] = findings(TL("date: 2026", top), "DG126");
    expect(d?.message).toMatch(message);
  });

  it("suggests the closest scale", () => {
    const [d] = findings(TL("date: 2026", "timeline: { scale: months }\n"), "DG126");
    expect(d?.fixes?.[0]).toBe("use scale: month");
  });

  it("an unknown axis key is DG108", () => {
    findings(TL("date: 2026", "timeline: { zoom: 2 }\n"), "DG108");
  });

  it.each(["date: 2026", "start: 2026, end: 2027", "milestone: true", "status: done"])(
    "%s outside kind: timeline is DG126",
    (keys) => {
      const [d] = findings(`nodes:\n  a: { label: A, ${keys} }\n`, "DG126");
      expect(d?.message).toMatch(/only applies to kind: timeline/);
    },
  );

  it("timeline outside kind: timeline is DG126", () => {
    findings("timeline: { scale: year }\nnodes: { a: A }\n", "DG126");
  });
});

// ---------------------------------------------------------------- layout and render

const SPECS: Record<string, string> = {
  er: `kind: er
title: Teams
nodes:
  teams: { fields: ["id uuid pk", "name text"] }
  users: { icon: aws:users, fields: ["id uuid pk", "team_id uuid fk", "email text unique"] }
  audit: { label: Audit log }
edges:
  - teams -> users: { label: has, card: "1:0..n", from_field: id, to_field: team_id }
  - users -> audit
`,
  sequence: `kind: sequence
title: Checkout
groups:
  back: { label: Backend }
nodes:
  web: { label: Web }
  api: { label: API, in: back }
  db: { icon: aws:aurora, label: DB, in: back }
edges:
  - web -> api: POST /orders
  - api -> api: validate
  - api -> db: insert
  - db --> api: id
  - api --> web: 201
fragments:
  - { type: alt, label: valid, from: 2, to: 5, else: [{ at: 5, label: invalid }] }
`,
  timeline: `kind: timeline
title: Roadmap
timeline: { scale: quarter, start: 2026-Q1, end: 2026-Q4, today: 2026-05-12 }
groups:
  core: { label: Core }
nodes:
  auth: { label: Auth, start: 2026-Q1, end: 2026-03, in: core, status: done }
  billing: { label: Billing, start: 2026-04, end: 2026-08-15, in: core, status: active }
  beta: { label: Beta, date: 2026-09, milestone: true }
edges:
  - billing -> beta
`,
};

describe("each kind lays out and renders", () => {
  it.each(
    Object.keys(SPECS).flatMap((kind) =>
      (["classic", "stage"] as Skin[]).map((skin) => [kind, skin] as const),
    ),
  )("%s in the %s skin", async (kind, skin) => {
    const m = model(must(SPECS[kind], kind));
    const r = await renderModel({
      model: m,
      formats: ["svg", "drawio", "mmd"],
      themes: ["light", "dark"],
      name: kind,
      skin,
    });
    const formats = r.artifacts.map((a) => `${a.format}:${a.theme}`);
    expect(formats).toEqual(
      expect.arrayContaining(["svg:light", "svg:dark", "drawio:dark", "mmd:dark"]),
    );
    for (const a of r.artifacts) {
      expect(typeof a.data === "string" && a.data.length > 0).toBe(true);
      expect(a.width).toBeGreaterThan(0);
    }
    const scene = must(r.scenes.dark, "the dark scene");
    expect(scene.kind).toBe(kind);
    expect(scene.nodes.map((n) => n.id).sort()).toEqual(m.nodes.map((n) => n.id).sort());
  });
});
