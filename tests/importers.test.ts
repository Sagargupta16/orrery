import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { resolveIcon } from "../src/icons/index.ts";
import { importCloudFormation } from "../src/import/cloudformation.ts";
import { importCompose } from "../src/import/compose.ts";
import { accessOf, hostsIn, portLabel } from "../src/import/iac.ts";
import { importKubernetes } from "../src/import/kubernetes.ts";
import { tableIcons } from "../src/import/tables.ts";
import { importTerraform } from "../src/import/terraform.ts";
import type { Imported } from "../src/import/types.ts";
import { renderModel } from "../src/render/index.ts";
import { parseSpec } from "../src/spec/index.ts";
import { listDiagnostics, ROOT } from "./helpers.ts";

const FIX = "tests/fixtures/import";

interface Doc {
  direction: string;
  groups: Record<string, { type: string; label: string; in?: string; evidence: string | string[] }>;
  nodes: Record<
    string,
    {
      icon: string;
      label: string;
      note?: string;
      in?: string;
      badge?: string;
      align?: string;
      evidence: string | string[];
    }
  >;
  edges: {
    from: string;
    to: string;
    label?: string;
    line?: string;
    arrow?: string;
    evidence: string | string[];
  }[];
}

const list = (e: string | string[] | undefined) => (Array.isArray(e) ? e : e ? [e] : []);

/** Imports from the repository root, so evidence paths read the same as on the command line. */
async function run(
  fn: (path: string) => Promise<Imported>,
  path: string,
): Promise<{ out: Imported; doc: Doc }> {
  const cwd = process.cwd();
  process.chdir(ROOT);
  try {
    const out = await fn(path);
    return { out, doc: parse(out.yaml) as Doc };
  } finally {
    process.chdir(cwd);
  }
}

/** The id of the node a resource is drawn as: its first evidence names it. */
function nodeOf(doc: Doc, evidence: string): string {
  // The users node cites the entry points it reaches, so it never stands for one of them.
  const hit = Object.entries(doc.nodes).find(([id, n]) => {
    const first = list(n.evidence)[0] ?? "";
    return id !== "users" && (first === evidence || first.endsWith(`#${evidence}`));
  });
  if (!hit) throw new Error(`no node with evidence ${evidence}`);
  return hit[0];
}

function edge(doc: Doc, from: string, to: string) {
  return doc.edges.find((e) => e.from === from && e.to === to);
}

const tmp = mkdtempSync(join(tmpdir(), "orrery-import-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
function file(name: string, text: string): string {
  const path = join(tmp, name);
  writeFileSync(path, text);
  return path;
}

const FIXTURES: [string, (path: string) => Promise<Imported>, string][] = [
  ["terraform state, serverless API", importTerraform, `${FIX}/serverless-api.tfstate.json`],
  ["terraform plan, VPC three-tier", importTerraform, `${FIX}/three-tier.plan.json`],
  ["SAM template", importCloudFormation, `${FIX}/orders-api.sam.yaml`],
  ["cdk.out folder", importCloudFormation, `${FIX}/cdk.out`],
  ["docker compose", importCompose, `${FIX}/shop-compose.yml`],
  ["kubernetes folder", importKubernetes, `${FIX}/k8s`],
];

describe("import tables", () => {
  it("names only icon ids that resolve, in their canonical form", () => {
    const ids = tableIcons();
    expect(ids.length).toBeGreaterThan(100);
    expect(ids.filter((id) => resolveIcon(id) !== id)).toEqual([]);
  });
});

describe.each(FIXTURES)("%s", (_name, fn, path) => {
  it("writes a spec that validates with no errors or warnings, as validate --strict asks", async () => {
    const { out } = await run(fn, path);
    expect(out.warnings).toEqual([]);
    const parsed = parseSpec(out.yaml, "imported.yaml");
    expect(parsed.diagnostics, listDiagnostics(parsed.diagnostics)).toEqual([]);
    const model = parsed.model;
    if (!model) throw new Error("no model");
    const result = await renderModel({
      model,
      formats: [],
      themes: [model.theme],
      name: "imported",
    });
    expect(result.diagnostics, listDiagnostics(result.diagnostics)).toEqual([]);
  });

  it("is deterministic", async () => {
    const a = await run(fn, path);
    const b = await run(fn, path);
    expect(a.out.yaml).toBe(b.out.yaml);
  });

  it("gives every node, group and edge evidence, and every file line holds its identifier", async () => {
    const { doc } = await run(fn, path);
    const items = [...Object.values(doc.nodes), ...Object.values(doc.groups ?? {}), ...doc.edges];
    const evidence = items.flatMap((i) => {
      expect(list(i.evidence).length).toBeGreaterThan(0);
      return list(i.evidence);
    });
    for (const e of evidence) {
      const m = e.match(/^(.+):(\d+)#(.+)$/);
      if (!m) continue;
      const line =
        readFileSync(join(ROOT, m[1] ?? ""), "utf8").split(/\r?\n/)[Number(m[2]) - 1] ?? "";
      expect(line, e).toContain(m[3]);
    }
  });

  it("lists what it left out in comments and draws no IAM, logs or settings as nodes", async () => {
    const { out, doc } = await run(fn, path);
    expect(out.yaml).toMatch(/^# left out: .+ \(.+\)$/m);
    const glue = /iam|log|route-table|security-group|secret|config-map|policy/i;
    expect(Object.keys(doc.nodes).filter((id) => glue.test(id))).toEqual([]);
  });

  it("uses only official icon ids", async () => {
    const { doc } = await run(fn, path);
    for (const n of Object.values(doc.nodes)) expect(resolveIcon(n.icon), n.icon).toBe(n.icon);
  });
});

describe("terraform", () => {
  it("draws flows from integrations, mappings, rule targets, redrive policies and IAM statements", async () => {
    const { doc } = await run(importTerraform, `${FIX}/serverless-api.tfstate.json`);
    const n = (e: string) => nodeOf(doc, e);
    expect(edge(doc, n("aws_apigatewayv2_api.http"), n("aws_lambda_function.api"))?.label).toBe(
      "GET /orders, POST /orders",
    );
    expect(edge(doc, n("aws_lambda_function.api"), n("aws_dynamodb_table.orders"))?.label).toBe(
      "reads and writes",
    );
    expect(edge(doc, n("aws_lambda_function.api"), n("aws_sqs_queue.jobs"))?.label).toBe(
      "enqueues",
    );
    // A function polling a queue: the arrow follows the data, from the queue.
    expect(edge(doc, n("aws_sqs_queue.jobs"), n("aws_lambda_function.worker"))?.label).toBe(
      "polls",
    );
    expect(edge(doc, n("aws_lambda_function.worker"), n("aws_sqs_queue.jobs"))).toBeUndefined();
    expect(edge(doc, n("aws_sqs_queue.jobs"), n("aws_sqs_queue.jobs_dlq"))?.label).toBe(
      "dead letters",
    );
    expect(
      edge(doc, n("aws_cloudwatch_event_rule.nightly"), n("aws_lambda_function.report"))?.label,
    ).toBe("triggers");
    // s3:PutObject on bucket/reports/* is a write to the bucket.
    expect(edge(doc, n("aws_lambda_function.report"), n("aws_s3_bucket.receipts"))?.label).toBe(
      "writes",
    );
  });

  it("leaves out roles, policies, permissions, log groups, helpers and data sources", async () => {
    const { out, doc } = await run(importTerraform, `${FIX}/serverless-api.tfstate.json`);
    for (const address of [
      "aws_iam_role.api",
      "aws_iam_role_policy.worker",
      "aws_lambda_permission.apigw",
      "aws_cloudwatch_log_group.api",
      "random_id.suffix",
      "data.aws_caller_identity.current",
    ])
      expect(out.yaml).toContain(`# left out: ${address} (`);
    expect(out.yaml).toContain(
      "# left out: aws_sns_topic_subscription.ops_email (email subscriber outside the stack)",
    );
    expect(Object.keys(doc.nodes)).toHaveLength(11);
  });

  it("reads a plan's unknown values through module outputs, variables and policy documents", async () => {
    const { doc } = await run(importTerraform, `${FIX}/three-tier.plan.json`);
    const n = (e: string) => nodeOf(doc, e);
    const asg = n("aws_autoscaling_group.web");
    expect(doc.nodes[n("aws_lb.web")]?.in).toBe("public-subnet");
    expect(doc.nodes[asg]?.in).toBe("app-subnet");
    expect(doc.nodes[n("aws_rds_cluster.main")]?.in).toBe("data-subnet");
    expect(doc.groups["eu-west-1"]?.type).toBe("aws:region");
    expect(doc.groups["public-subnet"]).toMatchObject({
      type: "aws:public-subnet",
      label: "Public subnets",
      in: "vpc",
    });
    expect(edge(doc, n("aws_lb.web"), asg)?.label).toBe("HTTP");
    expect(edge(doc, asg, n("aws_rds_cluster.main"))?.label).toBe("PostgreSQL");
    expect(edge(doc, asg, n("aws_elasticache_replication_group.cache"))?.label).toBe("Redis");
    expect(edge(doc, asg, n("aws_sqs_queue.events"))?.label).toBe("enqueues");
    expect(edge(doc, asg, n("aws_s3_bucket.assets"))?.label).toBe("reads");
  });

  it("turns count and for_each copies into one node with a badge", async () => {
    const { doc } = await run(importTerraform, `${FIX}/three-tier.plan.json`);
    expect(doc.nodes[nodeOf(doc, "module.vpc.aws_nat_gateway.this")]).toMatchObject({
      label: "shop-nat",
      badge: "x2",
    });
    expect(doc.nodes[nodeOf(doc, "aws_sqs_queue.events")]).toMatchObject({
      badge: "x2",
      note: "SQS queue: emails, orders",
    });
    // Two cluster instances are the cluster's badge, not nodes of their own.
    expect(doc.nodes[nodeOf(doc, "aws_rds_cluster.main")]?.badge).toBe("x2");
  });

  it("routes internet traffic through the internet gateway and draws NAT egress against the flow", async () => {
    const { doc } = await run(importTerraform, `${FIX}/three-tier.plan.json`);
    const igw = nodeOf(doc, "module.vpc.aws_internet_gateway.this");
    const nat = nodeOf(doc, "module.vpc.aws_nat_gateway.this");
    expect(edge(doc, "users", igw)?.label).toBe("HTTPS");
    expect(edge(doc, igw, nodeOf(doc, "aws_lb.web"))?.label).toBe("HTTPS");
    expect(edge(doc, "users", nodeOf(doc, "aws_lb.web"))).toBeUndefined();
    expect(edge(doc, nat, nodeOf(doc, "aws_autoscaling_group.web"))).toMatchObject({
      line: "dashed",
      arrow: "start",
    });
    expect(edge(doc, igw, nat)).toMatchObject({
      line: "dashed",
      arrow: "start",
      label: "outbound",
    });
  });

  it("never draws a dependency as a flow", async () => {
    const path = file(
      "deps.json",
      JSON.stringify({
        values: {
          root_module: {
            resources: [
              {
                address: "aws_sqs_queue.a",
                mode: "managed",
                type: "aws_sqs_queue",
                name: "a",
                values: { arn: "arn:aws:sqs:us-east-1:123456789012:a", name: "a" },
                depends_on: ["aws_sqs_queue.b"],
              },
              {
                address: "aws_sqs_queue.b",
                mode: "managed",
                type: "aws_sqs_queue",
                name: "b",
                values: { arn: "arn:aws:sqs:us-east-1:123456789012:b", name: "b" },
              },
              {
                address: "aws_unknown_thing.x",
                mode: "managed",
                type: "aws_unknown_thing",
                name: "x",
                values: {},
              },
            ],
          },
        },
      }),
    );
    const { out, doc } = await run(importTerraform, path);
    expect(doc.edges ?? []).toEqual([]);
    expect(out.warnings.join("\n")).toContain("aws_unknown_thing.x");
    expect(out.yaml).toContain(
      "# left out: aws_unknown_thing.x (no icon for this type in the import table)",
    );
  });

  it("places Azure and Google Cloud resources in their boundaries", async () => {
    const res = (type: string, name: string, values: Record<string, unknown>) => ({
      address: `${type}.${name}`,
      mode: "managed",
      type,
      name,
      values,
    });
    const path = file(
      "clouds.json",
      JSON.stringify({
        values: {
          root_module: {
            resources: [
              res("azurerm_resource_group", "app", {
                name: "rg-app",
                location: "westeurope",
                id: "/subscriptions/1/resourceGroups/rg-app",
              }),
              res("azurerm_linux_web_app", "web", {
                name: "shop-web",
                resource_group_name: "rg-app",
              }),
              res("google_pubsub_topic", "orders", {
                name: "orders",
                id: "projects/p1/topics/orders",
                project: "p1",
              }),
              res("google_cloudfunctions2_function", "fn", {
                name: "on-order",
                project: "p1",
                location: "europe-west1",
                event_trigger: [{ pubsub_topic: "projects/p1/topics/orders" }],
              }),
            ],
          },
        },
      }),
    );
    const { out, doc } = await run(importTerraform, path);
    expect(doc.nodes.web).toMatchObject({ icon: "azure:app-services", in: "app-rg" });
    expect(doc.groups["app-rg"]).toMatchObject({
      type: "azure:resource-group",
      label: "Resource group rg-app (westeurope)",
    });
    expect(doc.nodes.fn).toMatchObject({ icon: "gcp:cloud-functions", in: "europe-west1" });
    expect(doc.groups["europe-west1"]).toMatchObject({ type: "gcp:region", in: "p1" });
    expect(edge(doc, "orders", "fn")?.label).toBe("triggers");
    expect(out.warnings.join("\n")).toContain("Azure");
  });
});

describe("cloudformation", () => {
  it("reads SAM events, policy templates, inline statements and short tags", async () => {
    const { doc } = await run(importCloudFormation, `${FIX}/orders-api.sam.yaml`);
    const n = (e: string) => nodeOf(doc, e);
    expect(edge(doc, n("OrdersApi"), n("OrdersFunction"))?.label).toBe("GET /orders, POST /orders");
    expect(edge(doc, n("OrdersFunction"), n("OrdersTable"))?.label).toBe("reads and writes");
    expect(edge(doc, n("OrdersFunction"), n("JobsQueue"))?.label).toBe("enqueues");
    expect(edge(doc, n("JobsQueue"), n("WorkerFunction"))?.label).toBe("polls");
    expect(edge(doc, n("OrdersTable"), n("StreamFunction"))?.label).toBe("polls");
    expect(edge(doc, n("WorkerFunction"), n("EventsTopic"))?.label).toBe("publishes");
    expect(edge(doc, n("EventsTopic"), n("AuditFunction"))?.label).toBe("delivers");
    // An IAM role's statement pairs its function with the table (!GetAtt and !Sub).
    expect(edge(doc, n("AuditFunction"), n("OrdersTable"))?.label).toBe("reads");
    expect(edge(doc, n("Nightly"), n("ReportFunction"))?.label).toBe("triggers");
    expect(doc.nodes[n("Nightly")]?.note).toBe("cron(0 2 * * ? *)");
  });

  it("creates the API SAM makes for an event with no ApiId", async () => {
    const path = file(
      "implicit.yaml",
      [
        "Transform: AWS::Serverless-2016-10-31",
        "Resources:",
        "  Fn:",
        "    Type: AWS::Serverless::Function",
        "    Properties:",
        "      Handler: index.handler",
        "      Events:",
        "        Get:",
        "          Type: Api",
        "          Properties: { Path: /items, Method: get }",
        "",
      ].join("\n"),
    );
    const { doc } = await run(importCloudFormation, path);
    expect(doc.nodes["serverless-rest-api"]).toMatchObject({
      icon: "aws:api-gateway",
      note: "ServerlessRestApi",
    });
    expect(edge(doc, "serverless-rest-api", "fn")?.label).toBe("GET /items");
    expect(edge(doc, "users", "serverless-rest-api")?.label).toBe("HTTPS");
  });

  it("reads cdk.out: the manifest's Region, CDK grants, helper functions and zone copies", async () => {
    const { out, doc } = await run(importCloudFormation, `${FIX}/cdk.out`);
    const n = (e: string) => nodeOf(doc, e);
    expect(doc.groups["eu-central-1"]?.type).toBe("aws:region");
    expect(out.yaml).toContain(
      "# left out: CustomS3AutoDeleteObjectsCustomResourceProviderHandler9D90184F (function the deployment runs, not the app)",
    );
    expect(doc.nodes[n("VpcPublicSubnet1NATGateway1D7517AA")]).toMatchObject({
      label: "NAT gateway",
      badge: "x2",
    });
    expect(doc.nodes[n("DbCluster224236EF")]).toMatchObject({
      label: "Amazon Aurora",
      badge: "x2",
      in: "isolated-subnet",
    });
    expect(doc.groups["isolated-subnet"]?.label).toBe("Private subnets (isolated)");
    const service = n("Service9571FDD8");
    expect(doc.nodes[service]?.note).toBe("ECS service, 2 tasks");
    expect(edge(doc, n("LbE6F5A2B8"), service)?.label).toBe("HTTP :8080");
    expect(edge(doc, service, n("JobsQueue7C1E8D2A"))?.label).toBe("enqueues");
    expect(edge(doc, service, n("AssetsBucket5CB76180"))?.label).toBe("reads");
    expect(edge(doc, service, n("DbCluster224236EF"))?.label).toBe("PostgreSQL");
    expect(edge(doc, n("JobsQueue7C1E8D2A"), n("Worker8A5E1F2B"))?.label).toBe("polls");
  });
});

describe("compose", () => {
  it("draws URL and host:port environment values, links and published ports", async () => {
    const { doc } = await run(importCompose, `${FIX}/shop-compose.yml`);
    expect(edge(doc, "web", "db")?.label).toBe("PostgreSQL");
    expect(edge(doc, "worker", "cache")?.label).toBe("Redis");
    expect(edge(doc, "worker", "queue")?.label).toBe("AMQP");
    expect(edge(doc, "proxy", "web")).toBeDefined();
    expect(edge(doc, "users", "proxy")?.label).toBe("HTTP, HTTPS");
    expect(doc.nodes.web).toMatchObject({ badge: "x2", icon: "logos:docker-icon" });
    expect(doc.nodes.web?.in).toBeUndefined();
    expect(doc.nodes.db).toMatchObject({ icon: "logos:postgresql", in: "backend-network" });
  });

  it("never reads depends_on or a value that only repeats a service name as a flow", async () => {
    const path = file(
      "compose.yml",
      [
        "services:",
        "  app:",
        "    image: node:22",
        "    depends_on: [postgres]",
        "    environment:",
        "      POSTGRES_USER: postgres",
        "      DB_HOST: postgres",
        "  postgres:",
        "    image: postgres:16",
        "    environment:",
        "      POSTGRES_USER: postgres",
        "",
      ].join("\n"),
    );
    const { out, doc } = await run(importCompose, path);
    expect(doc.edges).toEqual([expect.objectContaining({ from: "app", to: "postgres" })]);
    expect(list(doc.edges[0]?.evidence)[0]).toMatch(/#DB_HOST$/);
    expect(out.yaml).toContain(
      "# left out: services.app.depends_on (start order (postgres), not a flow)",
    );
  });
});

describe("kubernetes", () => {
  it("draws Service selectors, Ingress routes, ConfigMap hosts and NetworkPolicy rules", async () => {
    const { doc } = await run(importKubernetes, `${FIX}/k8s`);
    expect(edge(doc, "users", "shop")?.label).toBe("HTTPS");
    expect(edge(doc, "shop", "api-svc")?.label).toBe("/api");
    expect(edge(doc, "api-svc", "api-deployment")?.label).toBe("HTTP :8080");
    expect(edge(doc, "web-deployment", "api-svc")?.label).toBe("HTTP");
    // DATABASE_URL comes from the api-config ConfigMap, across namespaces.
    const db = edge(doc, "api-deployment", "postgres-svc");
    expect(db?.label).toBe("PostgreSQL");
    expect(list(db?.evidence)[0]).toMatch(/config\.yaml:\d+#DATABASE_URL$/);
    expect(
      list(edge(doc, "worker", "redis-svc")?.evidence).some((e) => e.includes("redis.yaml")),
    ).toBe(true);
    expect(edge(doc, "report", "postgres-svc")).toBeDefined();
  });

  it("puts objects in namespace groups, replicas in badges and workloads beside their Service", async () => {
    const { out, doc } = await run(importKubernetes, `${FIX}/k8s`);
    expect(doc.groups["ns-data"]).toMatchObject({ type: "k8s:namespace", in: "cluster" });
    expect(doc.nodes["postgres-statefulset"]).toMatchObject({
      in: "ns-data",
      align: "postgres-svc",
    });
    expect(doc.nodes["api-deployment"]).toMatchObject({
      badge: "x3",
      note: "Deployment, api:1.4.2, scales 3 to 10",
    });
    expect(out.yaml).toContain("# left out: StorageClass//gp3 (storage settings)");
    expect(out.yaml).toContain("# left out: Secret/shop/api-db (credentials, used by everything)");
  });
});

describe("flow rules", () => {
  it("maps IAM actions to verbs, wildcards to every action they match", () => {
    expect(accessOf("s3:PutObject")).toEqual([{ verb: "writes" }]);
    expect(accessOf("s3:Get*")).toEqual([{ verb: "reads" }]);
    expect(accessOf("sqs:*").map((a) => a.verb)).toEqual(["enqueues", "polls"]);
    expect(accessOf("dynamodb:GetItem")).toEqual([{ verb: "reads" }]);
    expect(accessOf("dynamodb:GetRecords")).toEqual([]);
    expect(accessOf("logs:PutLogEvents")).toEqual([]);
    expect(accessOf("*")).toEqual([]);
  });

  it("finds hosts in URLs, host:port pairs and host-like keys only", () => {
    expect(hostsIn("DATABASE_URL", "postgres://u:p@db:5432/app")).toEqual([
      { host: "db", label: "PostgreSQL" },
    ]);
    expect(hostsIn("BROKERS", "kafka-1:9092,kafka-2:9092").map((h) => h.host)).toEqual([
      "kafka-1",
      "kafka-2",
    ]);
    expect(hostsIn("DB_HOST", "postgres")).toEqual([{ host: "postgres" }]);
    expect(hostsIn("POSTGRES_USER", "postgres")).toEqual([]);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a Compose default, not a template
    expect(hostsIn("API", "${API_HOST:-http://api:8080}")).toEqual([
      { host: "api", label: "HTTP" },
    ]);
  });

  it("names well-known ports", () => {
    expect(portLabel(5432)).toBe("PostgreSQL");
    expect(portLabel(8080)).toBe("HTTP :8080");
    expect(portLabel(7000, 7010)).toBe("TCP :7000-7010");
    expect(portLabel(0, 0, "-1")).toBe("all traffic");
  });
});
