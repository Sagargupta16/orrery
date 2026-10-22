// Data models (kind: er): table geometry, rows the relationships join, crow's foot marks, the
// Mermaid and draw.io forms, the measured conventions and the SQL importer.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkScene } from "../src/check/index.ts";
import { importSql } from "../src/import/sql.ts";
import { erGeometry } from "../src/layout/er/index.ts";
import { joinedRows } from "../src/layout/er/rows.ts";
import { BODY_PAD, ROW } from "../src/layout/er/table.ts";
import { layout } from "../src/layout/index.ts";
import { renderDrawio } from "../src/render/drawio.ts";
import { erMermaid } from "../src/render/mermaid-er.ts";
import { renderSvg } from "../src/render/svg.ts";
import { reviewScene } from "../src/review/index.ts";
import type { Model, Point, Scene, SceneNode } from "../src/types.ts";
import { contains, model, must, ROOT } from "./helpers.ts";

const SHOP = `title: Shop
kind: er
skin: classic
theme: light
nodes:
  customers:
    fields: ["id uuid pk", "email text unique", "name text"]
  orders:
    fields:
      - id uuid pk
      - customer_id uuid fk
      - coupon_id uuid fk null
      - total numeric
  order_items:
    fields: ["order_id uuid pk fk", "product_id uuid pk fk", "quantity int"]
  products:
    fields: ["id uuid pk", "sku text unique"]
  coupons:
    fields: ["id uuid pk", "code text unique"]
edges:
  - customers -- orders: { card: "1:0..n", label: places }
  - orders -- order_items: { card: "1:1..n", label: contains }
  - products -- order_items: { card: "1:0..n" }
  - coupons -- orders: { card: "0..1:0..n", from_field: id, to_field: coupon_id }
`;

async function laid(source: string): Promise<{ m: Model; scene: Scene }> {
  const m = model(source);
  return { m, scene: structuredClone(await layout(m)) };
}

const node = (scene: Scene, id: string): SceneNode =>
  must(
    scene.nodes.find((n) => n.id === id),
    `node ${id}`,
  );
const edge = (scene: Scene, from: string, to: string) =>
  must(
    scene.edges.find((e) => e.from === from && e.to === to),
    `edge ${from} -> ${to}`,
  );
/** The center line of a row of a table. */
const rowLine = (nd: SceneNode, name: string) => {
  const f = must(
    nd.fields?.find((x) => x.name === name),
    `row ${nd.id}.${name}`,
  );
  return f.box.y + f.box.h / 2;
};
/** Whether an end point sits on the left or right side of a box. */
const onSide = (p: Point, nd: SceneNode) =>
  (Math.abs(p.x - nd.box.x) < 0.5 || Math.abs(p.x - (nd.box.x + nd.box.w)) < 0.5) &&
  p.y > nd.box.y &&
  p.y < nd.box.y + nd.box.h;

describe("er: table geometry", () => {
  it("sizes a table as its header plus one row per field", () => {
    const m = model(SHOP);
    const orders = must(
      m.nodes.find((n) => n.id === "orders"),
      "orders",
    );
    const g = must(erGeometry(orders, true), "geometry");
    expect(g.label.lines).toEqual(["orders"]);
    // Header at least 34px, then the padded rows.
    expect(g.h - 2 * BODY_PAD - 4 * ROW).toBeGreaterThanOrEqual(34);
    expect(g.w).toBeGreaterThanOrEqual(168);
    // A longer column name widens the table.
    const wide = erGeometry(
      { ...orders, fields: [...(orders.fields ?? []), { name: "a_much_longer_column_name_here" }] },
      true,
    );
    expect(must(wide, "wide").w).toBeGreaterThan(g.w);
    expect(erGeometry({ ...orders, fields: undefined }, true)).toBeUndefined();
  });

  it("lays every row inside its table, one below the other", async () => {
    const { scene } = await laid(SHOP);
    for (const nd of scene.nodes) {
      const rows = must(nd.fields, `${nd.id} rows`);
      rows.forEach((f, i) => {
        expect(contains(nd.box, f.box)).toBe(true);
        expect(f.box.h).toBe(ROW);
        if (i) expect(f.box.y).toBeCloseTo((rows[i - 1]?.box.y ?? 0) + ROW, 1);
      });
      // The header text sits above the first row.
      expect(nd.labelBox.y + nd.labelBox.h).toBeLessThanOrEqual((rows[0]?.box.y ?? 0) + 0.5);
    }
  });
});

describe("er: relationships end on the rows they join", () => {
  it("infers the foreign key that names the other table and the key it points at", async () => {
    const { m, scene } = await laid(SHOP);
    const e = must(
      m.edges.find((x) => x.from === "customers" && x.to === "orders"),
      "edge",
    );
    expect(joinedRows(m, e)).toMatchObject({ from: { name: "id" }, to: { name: "customer_id" } });
    const s = edge(scene, "customers", "orders");
    const [a, b] = [must(s.points[0], "start"), must(s.points.at(-1), "end")];
    expect(onSide(a, node(scene, "customers"))).toBe(true);
    expect(onSide(b, node(scene, "orders"))).toBe(true);
    expect(a.y).toBeCloseTo(rowLine(node(scene, "customers"), "id"), 1);
    expect(b.y).toBeCloseTo(rowLine(node(scene, "orders"), "customer_id"), 1);
    expect(s.card).toEqual({ from: "one", to: "zero-many" });
  });

  it("names the rows from_field and to_field give, and a join table's keys", async () => {
    const { scene } = await laid(SHOP);
    const coupon = edge(scene, "coupons", "orders");
    expect(must(coupon.points.at(-1), "end").y).toBeCloseTo(
      rowLine(node(scene, "orders"), "coupon_id"),
      1,
    );
    const items = edge(scene, "products", "order_items");
    expect(must(items.points.at(-1), "end").y).toBeCloseTo(
      rowLine(node(scene, "order_items"), "product_id"),
      1,
    );
  });

  it("routes orthogonally, clear of every table, with a straight run out of each side", async () => {
    const { m, scene } = await laid(SHOP);
    for (const e of scene.edges) {
      for (let i = 1; i < e.points.length; i++) {
        const p = must(e.points[i - 1], "p");
        const q = must(e.points[i], "q");
        expect(Math.abs(p.x - q.x) < 0.5 || Math.abs(p.y - q.y) < 0.5).toBe(true);
      }
      const first = Math.abs(must(e.points[1], "1").x - must(e.points[0], "0").x);
      const last = Math.abs(must(e.points.at(-2), "-2").x - must(e.points.at(-1), "-1").x);
      expect(Math.min(first, last)).toBeGreaterThanOrEqual(20);
    }
    const through = checkScene(scene, m).filter((d) => d.code === "DG201");
    expect(through).toEqual([]);
  });

  it("lines joined rows up when a small move of the table allows it", async () => {
    const { scene } = await laid(`kind: er
nodes:
  a: { fields: ["id uuid pk", "x text", "y text", "z text"] }
  b: { fields: ["id uuid pk", "w text", "a_id uuid fk"] }
edges:
  - a -- b: { card: "1:0..n" }
`);
    const e = edge(scene, "a", "b");
    expect(e.points).toHaveLength(2);
    expect(must(e.points[0], "0").y).toBeCloseTo(must(e.points[1], "1").y, 1);
  });
});

describe("er: drawing", () => {
  it("draws crow's foot marks for each end", async () => {
    const { scene } = await laid(SHOP);
    const svg = renderSvg(scene);
    const group = (from: string, to: string) => {
      const id = edge(scene, from, to).id;
      return must(svg.match(new RegExp(`<g id="e-${id}">(.*?)</g>`))?.[1], `edge ${id}`);
    };
    const circles = (s: string) => (s.match(/<circle /g) ?? []).length;
    // one : zero or many: two bars, then a crow's foot and a circle.
    const places = group("customers", "orders");
    expect(circles(places)).toBe(1);
    expect(places).toMatch(/M[\d.]+ [\d.]+ L[\d.]+ [\d.]+ M[\d.]+ [\d.]+ L[\d.]+ [\d.]+"/);
    // one : one or many: no circle at all.
    expect(circles(group("orders", "order_items"))).toBe(0);
    // zero or one : zero or many: a circle at each end.
    expect(circles(group("coupons", "orders"))).toBe(2);
  });

  it("draws each table with its key tags, names and types, in both skins", async () => {
    const { scene } = await laid(SHOP);
    const svg = renderSvg(scene);
    const orders = must(svg.match(/<g id="n-orders">(.*?)<\/g>/)?.[1], "orders table");
    for (const text of ["PK", "FK", "customer_id", "uuid", "numeric", "uuid?"])
      expect(orders).toContain(`>${text}<`);
    const { scene: stage } = await laid(SHOP.replace("skin: classic", "skin: stage"));
    expect(renderSvg(stage)).toContain(">coupon_id<");
    // The stage skin recolors only: every row is where classic has it.
    expect(stage.nodes.map((n) => n.fields)).toEqual(scene.nodes.map((n) => n.fields));
  });

  it("writes a draw.io table per entity with one row cell per field", async () => {
    const { scene } = await laid(SHOP);
    const xml = renderDrawio(scene, "Shop");
    const table = must(xml.match(/<mxCell id="n-orders" [^>]*>/)?.[0], "orders cell");
    expect(table).toContain("shape=table;");
    expect(table).toContain("childLayout=tableLayout;");
    expect((xml.match(/id="n-orders:r\d+"/g) ?? []).length).toBe(4);
    expect(xml).toContain('id="n-orders:r1:name" value="customer_id"');
    // draw.io's own crow's foot ends on the relationship.
    const line = must(xml.match(/<mxCell id="[^"]+" value="places"[^>]*>/)?.[0], "places edge");
    expect(line).toContain("startArrow=ERmandOne;");
    expect(line).toContain("endArrow=ERzeroToMany;");
  });

  it("writes a Mermaid erDiagram with keys and cardinality", () => {
    const out = erMermaid(model(SHOP));
    expect(out.startsWith('---\ntitle: "Shop"\n---\nerDiagram\n')).toBe(true);
    expect(out).toContain("  orders {\n    uuid id PK\n    uuid customer_id FK\n");
    expect(out).toContain('    uuid coupon_id FK "null"\n');
    expect(out).toContain("    text email UK\n");
    expect(out).toContain("    uuid order_id PK, FK\n");
    expect(out).toContain('  customers ||--o{ orders : "places"\n');
    expect(out).toContain('  orders ||--|{ order_items : "contains"\n');
    expect(out).toContain('  coupons |o--o{ orders : ""\n');
  });
});

describe("er: measured conventions", () => {
  const ids = async (source: string) => {
    const { m, scene } = await laid(source);
    return reviewScene(scene, m, checkScene(scene, m), { width: 880 })
      .findings.map((f) => f.id)
      .filter((id) => id.startsWith("conventions.er-"));
  };

  it("passes a model with keys, cardinality and every foreign key drawn", async () => {
    expect(await ids(SHOP)).toEqual([]);
  });

  it("finds a missing key, missing cardinality, a dangling key, an orphan and many to many", async () => {
    const found = await ids(`kind: er
nodes:
  users: { fields: ["id uuid", "team_id uuid fk", "email text"] }
  teams: { fields: ["id uuid pk"] }
  tags: { fields: ["id uuid pk"] }
  posts: { fields: ["id uuid pk", "user_id uuid fk"] }
  audit: { fields: ["id uuid pk"] }
edges:
  - users -- posts
  - posts -- tags: { card: "0..n:0..n" }
  - teams -- tags: { card: "1:0..n" }
`);
    expect(found).toContain("conventions.er-primary-key");
    expect(found).toContain("conventions.er-cardinality");
    expect(found).toContain("conventions.er-dangling-fk");
    expect(found).toContain("conventions.er-orphan");
    expect(found).toContain("conventions.er-many-to-many");
  });
});

describe("er: import sql", () => {
  const path = join(ROOT, "tests", "fixtures", "import", "schema.sql");
  const yaml = importSql(readFileSync(path, "utf8"), "tests/fixtures/import/schema.sql");

  it("writes a spec that parses, with every table and its keys", () => {
    const m = model(yaml);
    expect(m.kind).toBe("er");
    expect(m.nodes.map((n) => n.id)).toEqual([
      "customers",
      "orders",
      "addresses",
      "products",
      "order_items",
      "payments",
      "employees",
    ]);
    const orders = must(
      m.nodes.find((n) => n.id === "orders"),
      "orders",
    );
    expect(orders.fields).toContainEqual({ name: "id", type: "uuid", pk: true });
    expect(orders.fields).toContainEqual({ name: "customer_id", type: "uuid", fk: true });
    expect(orders.fields).toContainEqual({
      name: "shipping_address_id",
      type: "uuid",
      fk: true,
      nullable: true,
    });
    // Multi-word and spaced types are written the short way.
    expect(orders.fields).toContainEqual({ name: "total", type: "numeric(10,2)" });
    const customers = must(
      m.nodes.find((n) => n.id === "customers"),
      "customers",
    );
    expect(customers.fields).toContainEqual({ name: "created_at", type: "timestamptz" });
    expect(customers.fields).toContainEqual({ name: "email", type: "text", unique: true });
    // A table constraint and an ALTER TABLE key count as much as an inline one.
    const items = must(
      m.nodes.find((n) => n.id === "order_items"),
      "order_items",
    );
    expect(items.fields?.filter((f) => f.pk).map((f) => f.name)).toEqual([
      "order_id",
      "product_id",
    ]);
    const products = must(
      m.nodes.find((n) => n.id === "products"),
      "products",
    );
    expect(products.fields).toContainEqual({ name: "sku", type: "text", unique: true });
  });

  it("infers cardinality from the foreign key and points evidence at the statement", () => {
    const m = model(yaml);
    const card = (from: string, to: string) =>
      m.edges.find((e) => e.from === from && e.to === to)?.card;
    expect(card("customers", "orders")).toEqual({ from: "one", to: "zero-many" });
    // Nullable: an order may have no shipping address.
    expect(card("addresses", "orders")).toEqual({ from: "zero-one", to: "zero-many" });
    // Unique: at most one payment per order.
    expect(card("orders", "payments")).toEqual({ from: "one", to: "zero-one" });
    const ship = must(
      m.edges.find((e) => e.from === "addresses" && e.to === "orders"),
      "ship",
    );
    expect([ship.fromField, ship.toField]).toEqual(["id", "shipping_address_id"]);
    expect(m.nodes.find((n) => n.id === "orders")?.evidence).toEqual([
      "tests/fixtures/import/schema.sql:11#orders",
    ]);
    expect(ship.evidence).toEqual(["tests/fixtures/import/schema.sql:68#addresses"]);
    for (const e of m.edges) expect(e.evidence?.length).toBe(1);
    // A self reference and a table the file does not create are listed, not drawn.
    expect(yaml).toContain("# left out: employees.manager_id references its own table");
    expect(yaml).toContain("# left out: employees.warehouse_id references warehouses");
  });
});
