import { transform } from "esbuild";
import { beforeAll, describe, expect, it } from "vitest";
import { layout } from "../src/layout.ts";
import { renderDrawio } from "../src/render/drawio.ts";
import { FORMATS, type RenderResult, renderModel } from "../src/render/index.ts";
import { renderPng } from "../src/render/png.ts";
import { renderSvg } from "../src/render/svg.ts";
import { componentName, renderTsx } from "../src/render/tsx.ts";
import type { Scene, ThemeName } from "../src/types.ts";
import {
  attributeValues,
  model,
  must,
  PNG_SIGNATURE,
  pngSize,
  SAMPLE,
  xmlProblems,
} from "./helpers.ts";

/** Markup characters in every kind of text, two copies of a gradient icon, a link, a step. */
const RICH = `title: "Orders <v2> & \\"friends\\" 'quoted' {braces}"
subtitle: Escapes, gradients, links and steps
groups:
  rg: { type: azure:resource-group }
  vnet: { type: azure:vnet, label: "Spoke & hub", in: rg }
nodes:
  vm1: { icon: azure:virtual-machine, label: "VM <1>", in: vnet, url: "https://example.com/?a=1&b=2" }
  vm2: { icon: azure:virtual-machine, label: VM 2, note: "B2s, 2 cores", badge: x2, in: vnet }
  db: { shape: cylinder, label: "Orders & refunds", color: "#2563eb" }
  fn: { icon: aws:lambda, look: card, note: "Node.js 22" }
  gh: si:github
edges:
  - vm1 -> vm2: "a & b"
  - vm2 -> db: { label: "write <batch>", step: 3 }
  - db --> fn
  - rg ..> gh: "deploy {main}"
`;

const THEMES: ThemeName[] = ["light", "dark"];
let rich: RenderResult;
let sample: RenderResult;

beforeAll(async () => {
  const request = { formats: [...FORMATS], themes: THEMES, scale: 1 };
  [rich, sample] = await Promise.all([
    renderModel({ ...request, model: model(RICH), name: "rich" }),
    renderModel({ ...request, model: model(SAMPLE), name: "orders" }),
  ]);
});

const text = (r: RenderResult, format: string, theme?: ThemeName): string => {
  const a = r.artifacts.find(
    (x) => x.format === format && (theme === undefined || x.theme === theme),
  );
  const data = must(a, `${format} ${theme ?? ""} artifact`).data;
  if (typeof data !== "string") throw new Error(`${format} is binary`);
  return data;
};
const scene = (r: RenderResult, theme: ThemeName): Scene => must(r.scenes[theme], `${theme} scene`);
const duplicates = (list: string[]) => list.filter((v, i) => list.indexOf(v) !== i);
const references = (doc: string) =>
  [...doc.matchAll(/url\(#([^)]+)\)|href="#([^"]+)"/g)].map((m) => m[1] ?? m[2] ?? "");

describe("renderModel", () => {
  it("returns every requested format per theme plus one HTML page", () => {
    const kinds = rich.artifacts.map((a) => `${a.format}:${a.theme ?? "both"}`);
    expect(kinds).toEqual([
      "svg:light",
      "png:light",
      "drawio:light",
      "tsx:light",
      "svg:dark",
      "png:dark",
      "drawio:dark",
      "tsx:dark",
      "html:both",
    ]);
  });

  it("builds the HTML page with both themes even when one theme is asked for", async () => {
    const r = await renderModel({
      model: model(SAMPLE),
      formats: ["html"],
      themes: ["dark"],
      name: "x",
    });
    expect(r.artifacts.map((a) => a.format)).toEqual(["html"]);
    expect(Object.keys(r.scenes).sort()).toEqual(["dark", "light"]);
  });

  it("reports the PNG size in pixels and the others in diagram units", async () => {
    const r = await renderModel({
      model: model(SAMPLE),
      formats: ["svg", "png", "drawio"],
      themes: ["light"],
      name: "x",
      scale: 2,
    });
    const s = scene(r, "light");
    const size = Object.fromEntries(r.artifacts.map((a) => [a.format, [a.width, a.height]]));
    expect(size).toEqual({
      svg: [s.width, s.height],
      png: [s.width * 2, s.height * 2],
      drawio: [s.width, s.height],
    });
    const png = must(
      r.artifacts.find((a) => a.format === "png"),
      "png",
    );
    expect(pngSize(png.data as Uint8Array)).toEqual({ width: png.width, height: png.height });
  });
});

describe("SVG", () => {
  it.each(THEMES)("is well-formed XML (%s)", (theme) => {
    expect(xmlProblems(text(rich, "svg", theme))).toEqual([]);
    expect(xmlProblems(text(sample, "svg", theme))).toEqual([]);
  });

  it("carries an accessible title and description", () => {
    const svg = text(rich, "svg", "light");
    // Artifact ids carry the diagram name and theme (renderModel's idPrefix).
    expect(svg).toMatch(
      /<svg [^>]*role="img"[^>]*aria-labelledby="rich-light-sdw-title rich-light-sdw-desc"/,
    );
    expect(svg).toContain(
      '<title id="rich-light-sdw-title">Orders &lt;v2&gt; &amp; &quot;friends&quot; &#39;quoted&#39; {braces}</title>',
    );
    const desc = must(svg.match(/<desc id="rich-light-sdw-desc">([^<]*)<\/desc>/), "desc")[1];
    expect(desc).toContain("5 components in 2 groups");
    expect(desc).toContain("VM &lt;1&gt; to VM 2 (a &amp; b)");
  });

  it("falls back to a generic title", async () => {
    const svg = renderSvg(await layout(model("nodes: { a: A }\n")));
    expect(svg).toContain("<title");
    expect(svg).toMatch(/<title id="sdw-title">Architecture diagram<\/title>/);
  });

  it.each(THEMES)("uses unique ids that every internal reference resolves to (%s)", (theme) => {
    const svg = text(rich, "svg", theme);
    const ids = attributeValues(svg, "id");
    expect(ids.length).toBeGreaterThan(10);
    expect(duplicates(ids)).toEqual([]);
    const refs = references(svg);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.filter((r) => !ids.includes(r))).toEqual([]);
  });

  it("loads nothing from outside the file", () => {
    for (const svg of [text(rich, "svg", "light"), text(sample, "svg", "dark")]) {
      expect(svg).not.toMatch(/<image|<foreignObject|<script|@import|url\(\s*['"]?(?!#)/i);
      // The only absolute URLs are the namespaces and the node link the spec asked for.
      const urls = [...svg.matchAll(/https?:\/\/[^"'\s)<]+/g)].map((m) => m[0]);
      const allowed = [
        "http://www.w3.org/2000/svg",
        "http://www.w3.org/1999/xlink",
        "https://example.com/?a=1&amp;b=2",
      ];
      expect(urls.filter((u) => !allowed.includes(u))).toEqual([]);
    }
  });

  it("renders a node url as a link", () => {
    expect(text(rich, "svg", "light")).toContain(
      '<a href="https://example.com/?a=1&amp;b=2" xlink:href="https://example.com/?a=1&amp;b=2" target="_blank">',
    );
  });

  it("prefixes every id and reference with idPrefix so two diagrams can share a page", () => {
    const svg = renderSvg(scene(rich, "light"), { idPrefix: "d2" });
    const ids = attributeValues(svg, "id");
    expect(ids.filter((id) => !id.startsWith("d2-"))).toEqual([]);
    expect(references(svg).filter((r) => !r.startsWith("d2-"))).toEqual([]);
    expect(svg).toContain('aria-labelledby="d2-sdw-title d2-sdw-desc"');
  });

  it("moves packets along the edges by default, with no CSS", () => {
    const svg = text(sample, "svg", "light");
    expect(svg).not.toContain("<style>");
    expect(svg).toContain("<animateMotion");
    expect(svg).not.toContain("sdw-flow");
    expect(xmlProblems(svg)).toEqual([]);
  });

  it("runs numbered edges in step order and loops them as one story", async () => {
    const s = await layout(
      model(
        "nodes: { a: A, b: B, c: C }\nedges:\n  - a -> b: { step: 1 }\n  - b -> c: { step: 2 }\n",
      ),
    );
    const svg = renderSvg(s);
    const loops = [...svg.matchAll(/<animateMotion [^>]*dur="([\d.]+)s"[^>]*keyTimes="([^"]+)"/g)];
    expect(loops).toHaveLength(2);
    expect(loops[0]?.[1]).toBe(loops[1]?.[1]);
    const leaves = loops.map((m) => Number((m[2] ?? "").split(";")[1]));
    expect(leaves[0]).toBe(0);
    expect(leaves[1]).toBeGreaterThan(0);
    expect(svg.match(/stroke-width="2" opacity="0">/g)).toHaveLength(2);
  });

  it("draws marching dashes for animate: flow and nothing for none", () => {
    const flow = renderSvg({ ...scene(sample, "light"), animate: "flow" });
    expect(flow).toMatch(/<style>@keyframes sdw-flow/);
    expect(flow).toContain('class="sdw-flow');
    expect(flow).not.toContain("<animateMotion");
    expect(xmlProblems(flow)).toEqual([]);
    const still = renderSvg({ ...scene(sample, "light"), animate: "none" });
    expect(still).not.toContain("<animate");
    expect(still).not.toContain("<style>");
  });

  it("draws open chevrons by default and filled triangles for arrowhead: filled", () => {
    const s = { ...scene(sample, "light"), animate: "none" as const };
    expect(s.arrowhead).toBe("open");
    const groups = (svg: string) =>
      [...svg.matchAll(/<g id="e-e\d+">(.*?)<\/g>/g)].map((m) => m[1] ?? "");
    const open = groups(renderSvg(s));
    const filled = groups(renderSvg({ ...s, arrowhead: "filled" }));
    expect(open).toHaveLength(7);
    expect(filled).toHaveLength(7);
    expect(filled.every((g) => /Z" fill="#[0-9a-f]{6}"\/>/.test(g))).toBe(true);
    expect(open.some((g) => /Z" fill="#/.test(g))).toBe(false);
    expect(open.every((g) => (g.match(/<path [^>]*fill="none"/g) ?? []).length === 2)).toBe(true);
  });

  it("paints the spec background, or none for transparent", () => {
    const s = scene(sample, "light");
    const background = `<rect width="${s.width}" height="${s.height}"`;
    expect(text(sample, "svg", "light")).toContain(background);
    expect(renderSvg({ ...s, background: "#f6f8fa" })).toContain(`${background} fill="#f6f8fa"/>`);
    expect(renderSvg({ ...s, background: "transparent" })).not.toContain(background);
  });

  it("draws layout.routing: spline as curves", async () => {
    const s = await layout(
      model(
        "layout: { routing: spline }\nnodes: { a: A, b: B, c: C }\nedges:\n  - a -> b\n  - a -> c\n  - b -> c\n",
      ),
    );
    const paths = [...renderSvg(s).matchAll(/<g id="e-e\d+"><path d="([^"]*)"/g)].map((m) => m[1]);
    expect(paths).toHaveLength(3);
    expect(paths.every((d) => / C[\d.-]/.test(d ?? ""))).toBe(true);
  });
});

describe("PNG", () => {
  it.each([1, 2])("starts with the PNG signature and is %ix the diagram size", async (scale) => {
    const s = scene(sample, "light");
    const png = await renderPng(renderSvg(s), { scale });
    expect([...png.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
    expect(pngSize(png)).toEqual({ width: s.width * scale, height: s.height * scale });
  });

  it("stays a still frame when the diagram is animated", async () => {
    const request = { model: model(SAMPLE), formats: ["png" as const], themes: THEMES, name: "x" };
    const [still, animated] = await Promise.all([
      renderModel({ ...request, scale: 1, animate: "none" }),
      renderModel({ ...request, scale: 1, animate: "packets" }),
    ]);
    const bytes = (r: RenderResult) =>
      r.artifacts.map((a) => Buffer.from(a.data).toString("base64"));
    expect(bytes(animated)).toEqual(bytes(still));
  });

  it("renders the dark theme too", () => {
    const png = must(
      rich.artifacts.find((a) => a.format === "png" && a.theme === "dark"),
      "png",
    );
    expect([...(png.data as Uint8Array).subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  });
});

describe("draw.io", () => {
  const cells = (xml: string) =>
    [...xml.matchAll(/<(mxCell|UserObject)\s([^>]*)>/g)].map((m) => {
      const attrs = Object.fromEntries(
        [...(m[2] ?? "").matchAll(/([\w:]+)="([^"]*)"/g)].map((a) => [a[1] ?? "", a[2] ?? ""]),
      );
      return { tag: m[1] ?? "", ...attrs } as Record<string, string>;
    });

  it.each(THEMES)("is well-formed XML (%s)", (theme) => {
    expect(xmlProblems(text(rich, "drawio", theme))).toEqual([]);
    expect(xmlProblems(text(sample, "drawio", theme))).toEqual([]);
  });

  it("has one cell per group, node and edge, with unique ids", () => {
    for (const [r, spec] of [
      [rich, model(RICH)],
      [sample, model(SAMPLE)],
    ] as const) {
      const all = cells(text(r, "drawio", "light"));
      const ids = all.map((c) => c.id).filter((id): id is string => id !== undefined);
      expect(duplicates(ids)).toEqual([]);
      for (const g of spec.groups) expect(ids.filter((id) => id === `g-${g.id}`)).toHaveLength(1);
      for (const n of spec.nodes) expect(ids.filter((id) => id === `n-${n.id}`)).toHaveLength(1);
      const edges = all.filter((c) => c.edge === "1");
      expect(edges.map((c) => c.id)).toEqual(spec.edges.map((e) => e.id));
    }
  });

  it("connects edges to cells that exist and nests cells under real parents", () => {
    const all = cells(text(rich, "drawio", "light"));
    const ids = new Set(all.map((c) => c.id).filter(Boolean));
    const edges = all.filter((c) => c.edge === "1");
    expect(edges.length).toBe(4);
    for (const e of edges) {
      expect(ids.has(e.source ?? "")).toBe(true);
      expect(ids.has(e.target ?? "")).toBe(true);
    }
    const parents = all.map((c) => c.parent).filter((p): p is string => p !== undefined);
    expect(parents.filter((p) => !ids.has(p))).toEqual([]);
    expect(edges.map((e) => [e.source, e.target])).toEqual([
      ["n-vm1", "n-vm2"],
      ["n-vm2", "n-db"],
      ["n-db", "n-fn"],
      ["g-rg", "n-gh"],
    ]);
  });

  it("keeps the link of a node with a url", () => {
    expect(text(rich, "drawio", "light")).toMatch(
      /<UserObject id="n-vm1" label="[^"]*" link="https:\/\/example\.com\/\?a=1&amp;b=2">/,
    );
  });

  it("gives children coordinates relative to their group", () => {
    const xml = text(sample, "drawio", "light");
    const s = scene(sample, "light");
    const geometryOf = (id: string) => {
      const m = xml.match(
        new RegExp(`id="${id}"[^>]*>(?:<mxCell[^>]*>)?<mxGeometry x="([\\d.-]+)" y="([\\d.-]+)"`),
      );
      return { x: Number(must(m, id)[1]), y: Number(must(m, id)[2]) };
    };
    const db = must(
      s.nodes.find((n) => n.id === "db"),
      "db",
    );
    const parent = must(
      s.groups.find((g) => g.id === db.parent),
      "db parent",
    ).box;
    const local = geometryOf("n-db");
    expect(local.x).toBeCloseTo(db.box.x - parent.x, 1);
    expect(local.y).toBeCloseTo(db.box.y - parent.y, 1);
  });

  it("keeps cell ids unique when a group id ends in -icon", async () => {
    const s = await layout(
      model(
        "groups:\n  vpc: { type: aws:vpc }\n  vpc-icon: { type: aws:vpc }\nnodes:\n  a: { in: vpc }\n  b: { in: vpc-icon }\n",
      ),
    );
    const ids = cells(renderDrawio(s)).map((c) => c.id ?? "");
    expect(duplicates(ids)).toEqual([]);
  });

  it("escapes edge, group and title text for draw.io's HTML labels", () => {
    const xml = text(rich, "drawio", "light");
    expect(xml).toContain('value="write &amp;lt;batch&amp;gt;"');
    expect(xml).toContain('value="Spoke &amp;amp; hub"');
    expect(xml).toContain('value="Orders &amp;lt;v2&amp;gt;');
  });
});

describe("TSX", () => {
  it.each(THEMES)("transpiles with esbuild (%s)", async (theme) => {
    const result = await transform(text(rich, "tsx", theme), { loader: "tsx" });
    expect(result.warnings).toEqual([]);
    expect(result.code).toContain("useId");
  });

  it("scopes every id with useId so two copies on a page never clash", () => {
    const tsx = text(rich, "tsx", "light");
    expect(tsx).toContain('import { type SVGProps, useId } from "react";');
    expect(tsx).toMatch(/const uid = useId\(\)/);
    const ids = [...tsx.matchAll(/\sid=(\S+)/g)].map((m) => m[1] ?? "");
    expect(ids.length).toBeGreaterThan(10);
    expect(ids.filter((id) => !/^\{`\$\{uid\}-/.test(id))).toEqual([]);
    expect(tsx).not.toContain("SDWUID");
  });

  it("exports a component named after the title and spreads props onto the svg", () => {
    const tsx = text(sample, "tsx", "light");
    expect(tsx).toContain("export default function OrdersPlatform(props: SVGProps<SVGSVGElement>)");
    expect(tsx).toContain("{...props}>");
  });

  it.each([
    ["Orders platform", "x", "OrdersPlatform"],
    [undefined, "my-diagram", "MyDiagram"],
    ["3 tier app", "x", "Diagram3TierApp"],
    ["!!!", "", "Diagram"],
  ])("names the component for title %s", (title, fallback, name) => {
    expect(componentName(title, fallback)).toBe(name);
  });

  it("transpiles a node url that contains a double quote", async () => {
    const s = await layout(model(`nodes:\n  a: { label: A, url: 'https://example.com/?q="x"' }\n`));
    await expect(transform(renderTsx(s, "Quoted"), { loader: "tsx" })).resolves.toBeDefined();
  });
});

describe("HTML", () => {
  const page = () => text(rich, "html");
  const embedded = (html: string, theme: ThemeName) => {
    const b64 = must(html.match(new RegExp(`${theme}: "([A-Za-z0-9+/=]+)"`)), `${theme} svg`)[1];
    return Buffer.from(must(b64, "base64"), "base64").toString("utf8");
  };

  it("embeds both theme SVGs as base64", () => {
    const html = page();
    expect(embedded(html, "light")).toBe(text(rich, "svg", "light"));
    expect(embedded(html, "dark")).toBe(text(rich, "svg", "dark"));
  });

  it("makes no network requests", () => {
    const html = page();
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<script[^>]+src=|<link\b|@import|<iframe/i);
  });

  it("escapes the title and starts in the requested theme", () => {
    const html = page();
    expect(html).toContain(
      "<title>Orders &lt;v2&gt; &amp; &quot;friends&quot; &#39;quoted&#39; {braces}</title>",
    );
    expect(html).toContain('<body data-theme="light">');
  });
});

describe("stage skin", () => {
  let classic: Scene;
  let stage: RenderResult;
  beforeAll(async () => {
    classic = await layout(model(RICH), { theme: "dark" });
    stage = await renderModel({
      formats: ["svg"],
      themes: THEMES,
      scale: 1,
      model: model(`skin: stage\n${RICH}`),
      name: "rich",
    });
  });

  it("keeps every box and point of the classic layout", () => {
    const s = scene(stage, "dark");
    expect([s.width, s.height]).toEqual([classic.width, classic.height]);
    expect(s.nodes.map((n) => [n.box, n.iconBox, n.labelBox])).toEqual(
      classic.nodes.map((n) => [n.box, n.iconBox, n.labelBox]),
    );
    expect(s.groups.map((g) => g.box)).toEqual(classic.groups.map((g) => g.box));
    expect(s.edges.map((e) => e.points)).toEqual(classic.edges.map((e) => e.points));
  });

  it("draws the portfolio kit: grid, one wash, ink tiles, mono caps, no vendor hues", () => {
    const svg = text(stage, "svg", "dark");
    expect(svg).toContain('<pattern id="rich-dark-grid"');
    expect(svg).toContain('<radialGradient id="rich-dark-wash"');
    expect(svg).toContain('font-family="&#39;Geist Mono&#39;');
    expect(svg).toContain(">SPOKE &amp; HUB</tspan>");
    // Frames and tiles are the structure color at an alpha; vendor colors never reach a stroke.
    expect(svg).toContain('stroke="#ffffff" stroke-opacity="0.16"');
    expect(svg).not.toMatch(/stroke="#(?:ed7100|0078d4|1490df)"/i);
    // Vendor artwork goes monochrome through tone filters.
    expect(svg).toMatch(/<filter id="rich-dark-f\d+"[^>]*><feColorMatrix/);
    expect(xmlProblems(svg)).toEqual([]);
  });

  it("tells one story on one clock: packets with comets, lit traces, popping badges", () => {
    const svg = text(stage, "svg", "light");
    expect(new Set([...svg.matchAll(/ dur="([\d.]+)s"/g)].map((m) => m[1])).size).toBe(1);
    const s = scene(stage, "light");
    // The numbered edge carries the story; at most two others run a packet of their own.
    const packets = [
      ...svg.matchAll(/<circle r="[\d.]+" fill="[^"]+" opacity="0"><animateMotion/g),
    ];
    expect(packets.length).toBeGreaterThan(1);
    expect(packets.length).toBeLessThanOrEqual(1 + 2);
    expect(svg).toContain('stroke-dasharray="1 1" stroke-dashoffset="1"');
    expect(svg).toContain('type="scale" values="0.4;0.4;1.3;1;1;1;0.4"');
    expect(s.edges.filter((e) => e.step !== undefined)).toHaveLength(1);
    // Every id, filters and masks included, goes through the prefix.
    expect(attributeValues(svg, "id").filter((id) => !id.startsWith("rich-light-"))).toEqual([]);
    expect(references(svg).filter((r) => !r.startsWith("rich-light-"))).toEqual([]);
  });

  it("is still in PNG and when animate is none", async () => {
    const request = {
      model: model(`skin: stage\n${RICH}`),
      formats: ["png" as const],
      themes: THEMES,
      name: "x",
      scale: 1,
    };
    const [relay, still] = await Promise.all([
      renderModel(request),
      renderModel({ ...request, animate: "none" }),
    ]);
    const bytes = (r: RenderResult) =>
      r.artifacts.map((a) => Buffer.from(a.data).toString("base64"));
    expect(bytes(relay)).toEqual(bytes(still));
    const svg = renderSvg({ ...scene(stage, "dark"), animate: "none" });
    expect(svg).not.toContain("<animate");
    expect(svg).not.toContain("<mask");
  });

  it("draws the held frame when still: everything lit, nothing moving", () => {
    const svg = renderSvg({ ...scene(stage, "dark"), animate: "none" });
    expect(svg).not.toContain("<animateMotion");
    expect(svg).toContain('stroke="#60a5fa" stroke-opacity="0.65"');
    expect(svg).toMatch(/<circle r="14" fill="#60a5fa"\/>/);
  });
});
