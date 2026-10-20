// `orrery describe`: the plain-text account of a laid-out diagram and the same as JSON, checked by
// the facts it must state rather than a snapshot, so layout changes do not churn it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cmdDescribe, type Description, describeData, describeScene } from "../src/describe.ts";
import { renderModel } from "../src/render/index.ts";
import type { Scene } from "../src/types.ts";
import { EXAMPLES_DIR, model, must } from "./helpers.ts";

async function laidOut(source: string) {
  const m = model(source);
  const r = await renderModel({ model: m, formats: [], themes: [m.theme], name: "test" });
  const scene: Scene = must(r.scenes[m.theme], "a scene");
  return { text: describeScene(scene, m), data: describeData(scene, m), model: m };
}
const example = (name: string) => readFileSync(join(EXAMPLES_DIR, `${name}.yaml`), "utf8");
const nodeOf = (d: Description, id: string) =>
  must(
    d.nodes.find((n) => n.id === id),
    id,
  );
/** The text line for a node: `- r<row>c<col> <id>...`. */
const lineOf = (text: string, id: string) =>
  must(
    text.split("\n").find((l) => new RegExp(`^- r\\d+c\\d+ ${id}\\b`).test(l)),
    `the line for ${id}`,
  );

// A typical 25-node architecture: five groups in a cloud, labeled edges and four numbered steps.
const TWENTY_FIVE = `title: Online store
subtitle: Web and mobile orders through an API tier to services, data stores and events
direction: right
groups:
  cloud: { type: aws:cloud }
  edge: { type: aws:generic, label: Edge, in: cloud }
  api: { type: aws:generic, label: API tier, in: cloud }
  svc: { type: aws:generic, label: Services, in: cloud }
  data: { type: aws:generic, label: Data stores, in: cloud }
  events: { type: aws:generic, label: Events, in: cloud }
nodes:
  web: { icon: aws:users, label: Web shoppers }
  mobile: { icon: aws:mobile-client, label: Mobile app }
  dns: { icon: aws:route-53, label: Amazon Route 53, in: edge }
  cdn: { icon: aws:cloudfront, label: Amazon CloudFront, in: edge }
  waf: { icon: aws:waf, label: AWS WAF, in: edge }
  gw: { icon: aws:api-gateway, label: Amazon API Gateway, in: api }
  auth: { icon: aws:cognito, label: Amazon Cognito, in: api }
  bff: { icon: aws:lambda, label: Storefront BFF, in: api }
  cart: { icon: aws:lambda, label: Cart, in: svc }
  orders: { icon: aws:lambda, label: Orders, in: svc }
  pay: { icon: aws:lambda, label: Payments, in: svc }
  stock: { icon: aws:lambda, label: Inventory, in: svc }
  ship: { icon: aws:lambda, label: Shipping, in: svc }
  search: { icon: aws:opensearch-service, label: Product search, in: svc }
  notify: { icon: aws:lambda, label: Notifications, in: svc }
  ddb: { icon: aws:dynamodb, label: Carts table, in: data }
  rds: { icon: aws:aurora, label: Orders database, in: data }
  cache: { icon: aws:elasticache, label: Session cache, in: data }
  s3: { icon: aws:s3, label: Product images, in: data }
  bus: { icon: aws:eventbridge, label: Order events, in: events }
  queue: { icon: aws:sqs, label: Shipping jobs, in: events }
  topic: { icon: aws:sns, label: Customer alerts, in: events }
  email: { icon: aws:ses, label: Email, in: events }
  logs: { icon: aws:cloudwatch, label: Amazon CloudWatch, in: cloud }
  secrets: { icon: aws:secrets-manager, label: AWS Secrets Manager, in: cloud }
edges:
  - web -> dns: { label: DNS, step: 1 }
  - web -> cdn: { label: HTTPS, step: 2 }
  - mobile -> gw: HTTPS
  - waf -> cdn
  - cdn -> gw: { label: API calls, step: 3 }
  - gw -> auth: verify
  - gw -> bff: { step: 4 }
  - bff -> cart, orders, search
  - cart -> ddb
  - cart -> cache
  - orders -> rds: SQL
  - orders -> pay: charge
  - orders -> stock: reserve
  - orders --> bus: OrderPlaced
  - bus --> queue
  - bus --> notify
  - queue --> ship: poll
  - notify -> topic
  - topic -> email
  - search -> s3: images
  - bff ..> logs: traces
  - orders ..> secrets: credentials
`;

describe("describe", () => {
  it("tells the starter's groups, rows and edges", async () => {
    const { text, data } = await laidOut(example("starter"));
    const lines = text.split("\n");
    expect(lines[0]).toBe("Web app on AWS");
    expect(text).toContain("Architecture diagram flowing right: 6 nodes, 3 groups, 5 edges.");
    // Groups come outer first, each heading followed by its own nodes.
    expect(data.groups.map((g) => g.id)).toEqual(["aws", "region", "vpc"]);
    expect(data.groups[1]?.members).toEqual(expect.arrayContaining(["vpc", "files"]));
    const vpc = lines.indexOf("vpc in region:");
    expect(vpc).toBeGreaterThan(lines.indexOf("region in aws:"));
    expect(lines.indexOf(lineOf(text, "app"))).toBeGreaterThan(vpc);
    expect(lines.slice(0, lines.indexOf('aws "AWS Cloud":'))).toContain("Not in a group:");
    // A flow to the right reads along one row: users, the load balancer, the service.
    const [users, alb, app] = ["users", "alb", "app"].map((id) => nodeOf(data, id));
    expect(new Set([users?.row, alb?.row, app?.row]).size).toBe(1);
    expect(alb?.col).toBe((users?.col ?? 0) + 1);
    expect(app?.col).toBe((alb?.col ?? 0) + 1);
    expect(app?.group).toBe("vpc");
    expect(lineOf(text, "app")).toMatch(/"Web service": <- alb; -> db, cache, files$/);
    // The label is told at the edge's source only.
    expect(lineOf(text, "users")).toContain("-> alb (HTTPS)");
    expect(lineOf(text, "alb")).toContain("<- users;");
  });

  it("numbers the steps and turns an arrow at the start around", async () => {
    const { text, data } = await laidOut(example("aws-eks-ecommerce"));
    expect(data.story).toEqual([
      { step: 1, from: "shoppers", to: "dns", label: "DNS query" },
      { step: 2, from: "shoppers", to: "cdn", label: "HTTPS" },
      { step: 3, from: "cdn", to: "alb", label: "origin requests" },
      { step: 4, from: "alb", to: "storefront" },
    ]);
    expect(text).toContain(
      "Steps: 1 shoppers -> dns; 2 shoppers -> cdn; 3 cdn -> alb; 4 alb -> storefront",
    );
    // `cluster -> ecr` with `arrow: start` is the registry feeding the cluster, a group end.
    expect(lineOf(text, "ecr")).toContain("-> cluster (pull images)");
    expect(text).toContain('cluster "Amazon EKS cluster" in private; <- ecr, secrets:');
    expect(nodeOf(data, "storefront").links).toContainEqual(
      expect.objectContaining({ dir: "out", with: "cognito", label: "verify tokens" }),
    );
    // Every edge is seen from both ends.
    const ends = [...data.nodes, ...data.groups].reduce((sum, x) => sum + x.links.length, 0);
    expect(ends).toBe(2 * data.counts.edges);
    expect(text.length).toBeLessThan(2000);
  });

  it("lists a state machine without groups, its pseudostates by id", async () => {
    const { text, data } = await laidOut(example("state-order-lifecycle"));
    expect(text).toContain("State diagram flowing down: 10 nodes, 0 groups, 12 edges.");
    expect(text).toContain("\nNodes (rRcC");
    expect(text).not.toContain("Groups and their nodes");
    expect(text).not.toContain('""');
    expect(lineOf(text, "created")).toContain("paid (pay [card ok] / charge)");
    expect(data.nodes[0]).toMatchObject({ id: "start", row: 1, col: 1 });
    // Reading order: rows top down, places left to right, no two nodes in one place.
    const places = data.nodes.map((n) => `${n.row}.${n.col}`);
    expect(new Set(places).size).toBe(places.length);
    const order = data.nodes.map((n) => n.row * 100 + n.col);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("keeps a 25-node diagram under 2,000 characters", async () => {
    const { text, data } = await laidOut(TWENTY_FIVE);
    expect(data.counts.nodes).toBe(25);
    expect(text.length).toBeLessThan(2000);
    for (const n of data.nodes) expect(text).toMatch(new RegExp(`^- r\\d+c\\d+ ${n.id}\\b`, "m"));
    expect(lineOf(text, "orders")).toContain("bus (OrderPlaced)");
  });

  describe("the command", () => {
    afterEach(() => {
      vi.restoreAllMocks();
      process.exitCode = 0;
    });
    const run = async (flags: Record<string, string | boolean>) => {
      let out = "";
      vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
        out += String(chunk);
        return true;
      });
      await cmdDescribe({ _: [join(EXAMPLES_DIR, "starter.yaml")], flags });
      vi.restoreAllMocks();
      return out;
    };

    it("prints the text, and the same as JSON with --json", async () => {
      const text = await run({});
      expect(text.startsWith("Web app on AWS\n")).toBe(true);
      const data = JSON.parse(await run({ json: true })) as Description;
      expect(data.title).toBe("Web app on AWS");
      expect(data.counts).toEqual({ nodes: 6, groups: 3, edges: 5 });
      for (const n of data.nodes) expect(text).toContain(` ${n.id}`);
    });
  });
});
