import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { renderModel } from "../src/render/index.ts";
import type { Skin, ThemeName } from "../src/types.ts";
import { attributeValues, EXAMPLES_DIR, model, must, xmlProblems } from "./helpers.ts";

async function sequence(
  source: string,
  theme: ThemeName = "light",
  skin?: Skin,
  name = "seq",
  file?: string,
): Promise<string> {
  const r = await renderModel({
    model: model(source, file),
    formats: ["sequence.svg"],
    themes: [theme],
    name,
    skin,
  });
  const data = must(r.artifacts[0], "sequence.svg artifact").data;
  if (typeof data !== "string") throw new Error("sequence.svg is binary");
  return data;
}

/** Message groups in drawing order, with the number in each badge. */
const messageIds = (svg: string, prefix: string) =>
  [...svg.matchAll(new RegExp(`<g id="${prefix}-sq-(?!l-)([^"]+)">`, "g"))].map((m) => m[1]);
const lifelineIds = (svg: string, prefix: string) =>
  [...svg.matchAll(new RegExp(`<g id="${prefix}-sq-l-([^"]+)">`, "g"))].map((m) => m[1]);
const references = (doc: string) =>
  [...doc.matchAll(/url\(#([^)]+)\)|href="#([^"]+)"/g)].map((m) => m[1] ?? m[2] ?? "");

const EXAMPLES = readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith(".yaml"));
/** Each example in both skins, one theme each: classic light and stage dark. */
const VARIANTS: [Skin, ThemeName][] = [
  ["classic", "light"],
  ["stage", "dark"],
];

describe("sequence.svg for every example", () => {
  const drawn = new Map<string, string>();
  beforeAll(async () => {
    const jobs = EXAMPLES.flatMap((file) =>
      VARIANTS.map(async ([skin, theme]) => {
        const name = file.replace(/\.yaml$/, "");
        const path = join(EXAMPLES_DIR, file);
        const source = readFileSync(path, "utf8");
        drawn.set(`${name} ${skin} ${theme}`, await sequence(source, theme, skin, name, path));
      }),
    );
    await Promise.all(jobs);
  });

  it("covers every example", () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(50);
    expect(drawn.size).toBe(EXAMPLES.length * VARIANTS.length);
  });

  it("is well-formed XML with unique ids that all resolve", () => {
    for (const [key, svg] of drawn) {
      expect(xmlProblems(svg), key).toEqual([]);
      const ids = attributeValues(svg, "id");
      expect(
        ids.filter((v, i) => ids.indexOf(v) !== i),
        key,
      ).toEqual([]);
      for (const ref of references(svg)) expect(ids, `${key} #${ref}`).toContain(ref);
    }
  });

  it("puts every id behind the diagram's prefix", () => {
    for (const [key, svg] of drawn) {
      const [name, , theme] = key.split(" ");
      for (const id of attributeValues(svg, "id"))
        expect(id.startsWith(`${name}-${theme}-`), `${key} ${id}`).toBe(true);
    }
  });

  it("draws the numbered edges in step order, else the longest path", () => {
    for (const file of EXAMPLES) {
      const m = model(readFileSync(join(EXAMPLES_DIR, file), "utf8"), join(EXAMPLES_DIR, file));
      const name = file.replace(/\.yaml$/, "");
      const svg = must(drawn.get(`${name} classic light`), name);
      const stepped = m.edges
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => e.step !== undefined)
        .sort((a, b) => (a.e.step ?? 0) - (b.e.step ?? 0) || a.i - b.i)
        .map(({ e }) => e.id);
      const drawnIds = messageIds(svg, `${name}-light`);
      if (stepped.length) expect(drawnIds, name).toEqual(stepped);
      else if (m.edges.length) {
        expect(drawnIds.length, name).toBeGreaterThan(0);
        expect(svg, name).toContain("Sequence of the longest path: 1. ");
      }
    }
  });
});

describe("sequence.svg", () => {
  it("orders lifelines by first visit and follows an arrow drawn at the start", async () => {
    const svg = await sequence(
      `skin: classic
nodes:
  dev: { label: Developer }
  agent: { label: Agent loop }
  llm: { label: Model }
  tool: { label: Tool }
edges:
  - dev -> agent: { label: prompt, step: 1 }
  # Written model -> agent with the arrow at the start: the agent calls the model.
  - { from: llm, to: agent, arrow: start, label: messages, step: 2 }
  - agent -> tool: { label: call, step: 3 }
`,
      "light",
      undefined,
      "agent",
    );
    expect(lifelineIds(svg, "agent-light")).toEqual(["dev", "agent", "llm", "tool"]);
    const desc = must(svg.match(/<desc[^>]*>([^<]*)<\/desc>/), "desc")[1];
    expect(desc).toContain("Sequence of the numbered steps: 1. Developer to Agent loop (prompt)");
    expect(desc).toContain("2. Agent loop to Model (messages)");
  });

  it("dashes a message that points back to an earlier lifeline", async () => {
    const svg = await sequence(
      `skin: classic
direction: right
nodes: { a: { label: A }, b: { label: B } }
edges:
  - a -> b: { label: ask, step: 1 }
  - b -> a: { label: answer, step: 2 }
`,
      "light",
      undefined,
      "back",
    );
    const group = (id: string) =>
      must(svg.match(new RegExp(`<g id="back-light-sq-${id}">.*?</g>`, "s")), id)[0];
    const [ask, answer] = messageIds(svg, "back-light");
    expect(group(must(ask, "ask"))).not.toContain("stroke-dasharray");
    expect(group(must(answer, "answer"))).toContain("stroke-dasharray");
  });

  it("draws the longest path, numbered, when there are no steps", async () => {
    const svg = await sequence(
      `nodes: { a: { label: A }, b: { label: B }, c: { label: C }, d: { label: D } }
edges:
  - a -> b
  - b -> c
  - c -> d
  - a -> d
`,
      "dark",
      "classic",
      "path",
    );
    expect(lifelineIds(svg, "path-dark")).toEqual(["a", "b", "c", "d"]);
    expect(messageIds(svg, "path-dark")).toHaveLength(3);
    expect(svg).toContain("Sequence of the longest path: 1. A to B; 2. B to C; 3. C to D");
    expect(xmlProblems(svg)).toEqual([]);
  });

  it("loops a message back to its own lifeline and escapes text", async () => {
    const svg = await sequence(
      `title: "Retry <loop> & more"
skin: classic
nodes: { a: { label: "App \\"x\\"" }, b: { label: B } }
edges:
  - a -> a: { label: "retry < 3", step: 1 }
  - a -> b: { step: 2 }
`,
      "light",
      undefined,
      "self",
    );
    expect(xmlProblems(svg)).toEqual([]);
    expect(svg).toContain("Retry &lt;loop&gt; &amp; more");
    expect(svg).toContain("App &quot;x&quot;");
    expect(svg).toContain("retry &lt; 3");
    const loop = must(svg.match(/<g id="self-light-sq-(?!l-)[^"]+"><path d="([^"]+)"/), "loop")[1];
    expect(loop).toMatch(/^M[\d.]+ [\d.]+ H[\d.]+ V[\d.]+ H[\d.]+$/);
  });

  it("draws in the scene's skin and theme", async () => {
    const SPEC = readFileSync(join(EXAMPLES_DIR, "ai-agent-mcp.yaml"), "utf8");
    const stage = await sequence(SPEC, "dark", "stage", "s");
    const classic = await sequence(SPEC, "dark", "classic", "c");
    expect(stage).toMatch(/font-family="&#39;Geist Mono&#39;/);
    expect(classic).toMatch(/font-family="Inter/);
    // The stage canvas: its gradient, grid and wash, then tiles under the glyphs.
    expect(stage).toContain('id="s-dark-bg"');
    expect(stage).toContain('fill="url(#s-dark-grid)"');
    // Classic dark: the dark canvas and the theme's step badges.
    expect(classic).toContain('fill="#0d1117"');
    expect(classic).toMatch(/<circle [^>]*fill="#e6edf3"\/>/);
  });

  it("stays a well-formed picture without edges", async () => {
    const svg = await sequence("nodes: { a: { label: A } }\n", "light", "classic", "none");
    expect(xmlProblems(svg)).toEqual([]);
    expect(svg).toContain("No edges to put in sequence");
  });
});
