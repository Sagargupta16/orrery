import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { importMermaid } from "../src/import/mermaid.ts";
import { parseSpec } from "../src/spec.ts";
import { listDiagnostics, runCli } from "./helpers.ts";

const FLOW = `flowchart LR
  %% a typical README architecture
  user([User]) --> cdn[CloudFront]
  subgraph vpc [Production VPC]
    alb[Application Load Balancer] --> api(API service)
    api -->|reads| cache[(Redis)]
    api -- writes --> db[(PostgreSQL)]
    api -.-> queue>Kafka]
  end
  cdn ==> alb
  queue --> worker{{Worker}} & audit[Audit log]
  subgraph Monitoring Stack
    prom[Prometheus] --- graf[Grafana]
  end
  api -.-> prom
`;

interface Doc {
  direction: string;
  groups: Record<string, { type: string; label: string; in?: string }>;
  nodes: Record<string, { icon?: string; label: string; shape?: string; in?: string }>;
  edges: string[];
}

const doc = (source: string): Doc => parse(importMermaid(source).yaml) as Doc;

describe("Mermaid import", () => {
  it("produces a spec that validates with no errors", () => {
    const result = parseSpec(importMermaid(FLOW).yaml, "imported.yaml");
    expect(result.model, listDiagnostics(result.diagnostics)).toBeDefined();
  });

  it("maps the flowchart direction", () => {
    expect(doc(FLOW).direction).toBe("right");
    expect(doc("graph TD\n  a --> b\n").direction).toBe("down");
    expect(doc("flowchart BT\n  a --> b\n").direction).toBe("up");
  });

  it("turns subgraphs into zone groups, with ids and multi-word titles", () => {
    const d = doc(FLOW);
    expect(d.groups.vpc).toMatchObject({ type: "zone", label: "Production VPC" });
    const monitoring = Object.values(d.groups).find((g) => g.label === "Monitoring Stack");
    expect(monitoring).toBeDefined();
    expect(d.nodes.alb?.in).toBe("vpc");
    expect(d.nodes.prom?.in).toBe(Object.keys(d.groups).find((k) => d.groups[k] === monitoring));
  });

  it("keeps edge styles and both label forms", () => {
    const { edges } = doc(FLOW);
    expect(edges).toContain("api -> cache: reads");
    expect(edges).toContain("api -> db: writes");
    expect(edges).toContain("api ..> queue");
    expect(edges).toContain("cdn ==> alb");
    expect(edges).toContain("prom -- graf");
  });

  it("expands & into one edge per target", () => {
    const { edges } = doc(FLOW);
    expect(edges).toContain("queue -> worker");
    expect(edges).toContain("queue -> audit");
  });

  it("maps bracket shapes", () => {
    const { nodes } = doc(
      "flowchart LR\n  a((Start)) --> b{Ok?} --> c{{Job}} --> d[(Store)] --> e>Flag] --> f(Step)\n",
    );
    expect(nodes.a?.shape).toBe("circle");
    expect(nodes.b?.shape).toBe("diamond");
    expect(nodes.c?.shape).toBe("hexagon");
    expect(nodes.d?.shape).toBe("cylinder");
    expect(nodes.e?.shape).toBe("note");
    expect(nodes.f?.shape).toBe("rounded");
  });

  it("sets official icons only for exact product names, preferring square marks", () => {
    const { nodes } = doc(FLOW);
    expect(nodes.cdn?.icon).toBe("aws:cloudfront");
    expect(nodes.cache?.icon).toBe("logos:redis");
    expect(nodes.queue?.icon).toBe("logos:kafka-icon");
    expect(nodes.api?.icon).toBeUndefined();
    expect(nodes.alb?.icon).toBeUndefined();
  });

  it("lists every guessed icon in a comment so a reviewer can check them", () => {
    const { yaml, guessed } = importMermaid(FLOW);
    for (const [id, icon] of Object.entries(guessed)) expect(yaml).toContain(`${id}=${icon}`);
  });

  it("ignores styling, comments and classes", () => {
    const d = doc(
      "flowchart LR\n  classDef hot fill:#f00\n  a:::hot --> b\n  style a fill:#0f0\n  %% note\n  linkStyle 0 stroke:#000\n",
    );
    expect(Object.keys(d.nodes).sort()).toEqual(["a", "b"]);
    expect(d.edges).toEqual(["a -> b"]);
  });

  it("warns when the input is not a flowchart", () => {
    expect(importMermaid("sequenceDiagram\n  Alice->>Bob: hi\n").warnings.length).toBeGreaterThan(
      0,
    );
  });

  it("runs from the CLI and prints YAML", async () => {
    const run = await runCli(["import", "mermaid", "-"], undefined, FLOW);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("nodes:");
  });
});
