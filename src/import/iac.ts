// Shared by the infrastructure importers (terraform, cloudformation, compose, kubernetes): a
// draft of groups, nodes and edges keyed by what they came from, the rules that turn access and
// ports into flow labels, and the writer that turns a draft into a spec with evidence on every
// item and every left-out resource listed in a comment. Deterministic: the same input gives the
// same text, so CI can redraw a diagram without a model.
import { relative, resolve, sep } from "node:path";
import { stringify } from "yaml";
import { iconInfo } from "../icons/index.ts";
import type { Imported } from "./types.ts";

export interface DraftGroup {
  key: string;
  id: string;
  type: string;
  label: string;
  parent?: string;
  evidence: string[];
}

export interface DraftNode {
  key: string;
  id: string;
  icon: string;
  label: string;
  note?: string;
  parent?: string;
  badge?: string;
  /** Another node's key: this one shares its layer, beside it across the flow. */
  align?: string;
  evidence: string[];
}

export interface DraftEdge {
  from: string;
  to: string;
  labels: string[];
  dashed: boolean;
  /**
   * A flow against the main path (traffic out through NAT): written from its end with the arrow
   * at the start, as the AWS three-tier example does, so it does not turn the layers around.
   */
  back: boolean;
  evidence: string[];
}

export interface NodeSpec {
  icon: string;
  /** The resource's own name (a function name, a Service name). */
  name: string;
  /** What kind of thing it is, in a few words ("Lambda function", "Deployment"). */
  what: string;
  /** Overrides the note the icon rule picks. */
  note?: string;
  parent?: string;
  /** How many copies the node stands for: 2 or more draws `badge: xN`. */
  copies?: number;
  /** Another node's key to sit beside (a workload beside the Service that fronts it). */
  align?: string;
  /** A short id to start from; made unique across nodes and groups. */
  hint: string;
  evidence: string[];
}

export interface WriteOptions {
  title: string;
  subtitle?: string;
  /** The command line that redraws the spec, written in the header comment. */
  command: string;
  /** Defaults to the shape of the flow: across when it is short and wide, else down. */
  direction?: "right" | "down";
  legend?: { dashed?: string };
}

/** Lowercase letters, digits and single dashes: a node or group id. */
export function slug(text: string): string {
  return (
    text
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item"
  );
}

/** "orders_api" and "OrdersApi" read as "Orders api". */
export function humanize(text: string): string {
  const words = text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_\-./]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    // Acronyms keep their capitals: NATGateway reads "NAT gateway".
    .map((w) => (/^[A-Z0-9]{2,}$/.test(w) && /[A-Z]/.test(w) ? w : w.toLowerCase()))
    .join(" ");
  return words ? (words[0]?.toUpperCase() ?? "") + words.slice(1) : text;
}

/** A path as evidence: relative to the working folder when inside it, with forward slashes. */
export function displayPath(file: string): string {
  const abs = resolve(file);
  const rel = relative(process.cwd(), abs);
  const shown = rel && !rel.startsWith("..") && !rel.includes(":") ? rel : file;
  return shown.split(sep).join("/");
}

/** `path:line#identifier`, the evidence form `orrery verify` reads. */
export function at(path: string, line: number | undefined, ident: string): string {
  return line ? `${path}:${line}#${ident}` : `${path}#${ident}`;
}

const GENERIC_ICON = /^(Amazon|AWS) /;

export class Draft {
  readonly groups = new Map<string, DraftGroup>();
  readonly nodes = new Map<string, DraftNode>();
  readonly edges = new Map<string, DraftEdge>();
  readonly leftOut = new Map<string, string>();
  readonly warnings: string[] = [];
  private readonly ids = new Set<string>();

  private claim(hint: string): string {
    const base = slug(hint);
    let id = base;
    for (let n = 2; this.ids.has(id); n++) id = `${base}-${n}`;
    this.ids.add(id);
    return id;
  }

  /** Adds a boundary once; a second call with the same key only adds evidence. */
  group(
    key: string,
    spec: { type: string; label: string; parent?: string; hint: string; evidence: string[] },
  ): string {
    const existing = this.groups.get(key);
    if (existing) {
      pushAll(existing.evidence, spec.evidence);
      return key;
    }
    this.groups.set(key, {
      key,
      id: this.claim(spec.hint),
      type: spec.type,
      label: spec.label,
      ...(spec.parent ? { parent: spec.parent } : {}),
      evidence: unique(spec.evidence),
    });
    return key;
  }

  /**
   * Adds a node. An AWS service icon takes the service's name as its label and the resource's
   * name as its note, as the AWS deck asks; every other icon takes the resource's name as its
   * label and what it is as its note.
   */
  node(key: string, spec: NodeSpec): string {
    const existing = this.nodes.get(key);
    if (existing) {
      pushAll(existing.evidence, spec.evidence);
      return key;
    }
    const info = iconInfo(spec.icon);
    const service = info?.pack === "aws" && info.type === "service" && GENERIC_ICON.test(info.name);
    const label = service && info ? info.name : spec.name;
    const note = spec.note ?? (service ? spec.name : spec.what);
    this.nodes.set(key, {
      key,
      id: this.claim(spec.hint),
      icon: spec.icon,
      label,
      ...(note && note !== label ? { note } : {}),
      ...(spec.parent ? { parent: spec.parent } : {}),
      ...(spec.copies && spec.copies > 1 ? { badge: `x${spec.copies}` } : {}),
      ...(spec.align ? { align: spec.align } : {}),
      evidence: unique(spec.evidence),
    });
    return key;
  }

  /** A flow from one node key to another; flows between the same pair merge their labels. */
  edge(
    from: string,
    to: string,
    label: string | undefined,
    evidence: string[],
    opts: { dashed?: boolean; back?: boolean } = {},
  ) {
    if (from === to) return;
    const key = `${from}\u0000${to}`;
    const existing = this.edges.get(key);
    if (existing) {
      if (label && !existing.labels.includes(label)) existing.labels.push(label);
      pushAll(existing.evidence, evidence);
      return;
    }
    this.edges.set(key, {
      from,
      to,
      labels: label ? [label] : [],
      dashed: opts.dashed === true,
      back: opts.back === true,
      evidence: unique(evidence),
    });
  }

  /** Lists a resource that is not drawn, with the reason, in the spec's closing comment. */
  leave(what: string, why: string) {
    if (!this.leftOut.has(what)) this.leftOut.set(what, why);
  }

  warn(message: string) {
    if (!this.warnings.includes(message)) this.warnings.push(message);
  }

  /** Every ancestor group key of a group, nearest first. */
  ancestors(key: string | undefined): string[] {
    const out: string[] = [];
    for (let k = key; k && !out.includes(k); k = this.groups.get(k)?.parent) out.push(k);
    return out;
  }

  /** The innermost group that holds every one of the given groups. */
  commonGroup(keys: (string | undefined)[]): string | undefined {
    const chains = keys.map((k) => this.ancestors(k).reverse());
    if (!chains.length || chains.some((c) => !c.length)) return undefined;
    let common: string | undefined;
    for (let i = 0; ; i++) {
      const k = chains[0]?.[i];
      if (!k || chains.some((c) => c[i] !== k)) return common;
      common = k;
    }
  }

  write(opts: WriteOptions): Imported {
    const edges = [...this.edges.values()].filter(
      (e) => this.nodes.has(e.from) && this.nodes.has(e.to),
    );
    const laid = edges.map((e) => (e.back ? { ...e, from: e.to, to: e.from } : e));
    const { order, layers, widest } = flowOrder([...this.nodes.keys()], laid);
    // A README column is narrow: a flow runs across only when it is short and wide.
    const direction = opts.direction ?? (layers <= 3 && widest > layers ? "right" : "down");
    // Four or more nested boundaries (cloud, Region, VPC, subnet) need the room to route edges
    // into the inner groups beside their header labels rather than through them.
    const depth = Math.max(0, ...[...this.groups.keys()].map((k) => this.ancestors(k).length));
    const used = new Set<string>();
    for (const n of this.nodes.values()) for (const g of this.ancestors(n.parent)) used.add(g);
    const groups: Record<string, unknown> = {};
    for (const g of this.groups.values()) {
      if (!used.has(g.key)) continue;
      const parent = g.parent ? this.groups.get(g.parent) : undefined;
      groups[g.id] = {
        type: g.type,
        label: g.label,
        ...(parent ? { in: parent.id } : {}),
        evidence: evidenceOf(g.evidence),
      };
    }
    const id = (key: string) => this.nodes.get(key)?.id ?? key;
    const nodes: Record<string, unknown> = {};
    for (const key of order) {
      const n = this.nodes.get(key);
      if (!n) continue;
      const parent = n.parent ? this.groups.get(n.parent) : undefined;
      nodes[n.id] = {
        icon: n.icon,
        label: n.label,
        ...(n.note ? { note: n.note } : {}),
        ...(parent ? { in: parent.id } : {}),
        ...(n.badge ? { badge: n.badge } : {}),
        ...(n.align && this.nodes.has(n.align) ? { align: id(n.align) } : {}),
        evidence: evidenceOf(n.evidence),
      };
    }
    const rank = new Map(order.map((k, i) => [k, i]));
    laid.sort(
      (a, b) =>
        (rank.get(a.from) ?? 0) - (rank.get(b.from) ?? 0) ||
        (rank.get(a.to) ?? 0) - (rank.get(b.to) ?? 0),
    );
    const dashed = laid.some((e) => e.dashed);
    const spec = {
      title: opts.title,
      ...(opts.subtitle ? { subtitle: opts.subtitle } : {}),
      direction,
      // A long chain run down the page is a tall strip at README width; compact gaps keep it
      // readable. Deep nesting still wins, since it needs the room to route.
      ...(depth >= 4
        ? { layout: { spacing: "loose" } }
        : direction === "down" && layers > 6
          ? { layout: { spacing: "compact" } }
          : {}),
      ...(dashed && opts.legend?.dashed
        ? { legend: { solid: "Traffic and data", dashed: opts.legend.dashed } }
        : {}),
      ...(Object.keys(groups).length ? { groups } : {}),
      nodes,
      ...(laid.length
        ? {
            edges: laid.map((e) => ({
              from: id(e.from),
              to: id(e.to),
              ...(e.labels.length ? { label: joinLabels(e.labels) } : {}),
              ...(e.back ? { arrow: "start" } : {}),
              ...(e.dashed ? { line: "dashed" } : {}),
              evidence: evidenceOf(e.evidence),
            })),
          }
        : {}),
    };
    const head = [
      `# Drawn by \`${opts.command}\`; run it again to redraw from the source.`,
      "# Every node, group and edge carries the evidence it was read from.",
    ];
    const tail = [...this.leftOut].map(
      ([what, why]) => `# left out: ${oneLine(what)} (${oneLine(why)})`,
    );
    const body = stringify(spec, { lineWidth: 0 });
    return {
      yaml: `${head.join("\n")}\n${body}${tail.length ? `\n${tail.join("\n")}\n` : ""}`,
      warnings: [...this.warnings],
    };
  }
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function unique<T>(list: T[]): T[] {
  return [...new Set(list)];
}

function pushAll(into: string[], more: string[]) {
  for (const m of more) if (!into.includes(m)) into.push(m);
}

function evidenceOf(list: string[]): string | string[] {
  const all = unique(list);
  return all.length === 1 ? (all[0] ?? "") : all;
}

/** "reads" and "writes" become "reads and writes"; three or more join with commas. */
export function joinLabels(labels: string[]): string {
  const set = unique(labels);
  if (set.includes("reads") && set.includes("writes")) {
    set.splice(set.indexOf("writes"), 1);
    set.splice(set.indexOf("reads"), 1, "reads and writes");
  }
  if (set.length <= 1) return set[0] ?? "";
  if (set.length === 2) return `${set[0]}, ${set[1]}`;
  return `${set.slice(0, 2).join(", ")} +${set.length - 2}`;
}

/**
 * Node keys in flow order: entry points first, then each node after everything that feeds it
 * (ties keep the source order). Layout takes the spec order as its first guess, so a spec that
 * already reads along the flow lays out with fewer crossings.
 */
function flowOrder(
  keys: string[],
  edges: DraftEdge[],
): { order: string[]; layers: number; widest: number } {
  const index = new Map(keys.map((k, i) => [k, i]));
  const out = new Map<string, string[]>();
  for (const e of edges) out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const into = new Set(edges.map((e) => e.to));
  const walk = (k: string, d: number) => {
    if (visiting.has(k) || (depth.get(k) ?? -1) >= d) return;
    depth.set(k, d);
    visiting.add(k);
    for (const next of out.get(k) ?? []) walk(next, d + 1);
    visiting.delete(k);
  };
  for (const k of keys) if (!into.has(k)) walk(k, 0);
  for (const k of keys) if (!depth.has(k)) walk(k, 0);
  const order = [...keys].sort(
    (a, b) =>
      (depth.get(a) ?? 0) - (depth.get(b) ?? 0) || (index.get(a) ?? 0) - (index.get(b) ?? 0),
  );
  const perLayer = new Map<number, number>();
  for (const d of depth.values()) perLayer.set(d, (perLayer.get(d) ?? 0) + 1);
  return { order, layers: perLayer.size, widest: Math.max(0, ...perLayer.values()) };
}

// ------------------------------------------------------------------ access and ports

export interface Access {
  verb: string;
  /** The caller pulls (polls a queue, reads a stream): the arrow follows the data instead. */
  pull?: boolean;
}

const READS: Access = { verb: "reads" };
const WRITES: Access = { verb: "writes" };
const POLLS: Access = { verb: "polls", pull: true };
// DynamoDB's stream reads (GetRecords) are left out: read grants include them, and the event
// source mapping that really polls the stream draws that flow.

/** IAM actions that move data, by service: the flow label, and whether the caller pulls. */
const ACTIONS: Record<string, [string[], Access][]> = {
  s3: [
    [["GetObject", "GetObjectVersion", "ListBucket", "ListBucketVersions"], READS],
    [["PutObject", "DeleteObject", "DeleteObjectVersion", "AbortMultipartUpload"], WRITES],
  ],
  dynamodb: [
    [["GetItem", "BatchGetItem", "Query", "Scan", "ConditionCheckItem", "PartiQLSelect"], READS],
    [
      ["PutItem", "UpdateItem", "DeleteItem", "BatchWriteItem", "PartiQLInsert", "PartiQLUpdate"],
      WRITES,
    ],
  ],
  sqs: [
    [["SendMessage", "SendMessageBatch"], { verb: "enqueues" }],
    [["ReceiveMessage", "DeleteMessage", "DeleteMessageBatch"], POLLS],
  ],
  sns: [[["Publish"], { verb: "publishes" }]],
  events: [[["PutEvents"], { verb: "sends events" }]],
  kinesis: [
    [["PutRecord", "PutRecords"], WRITES],
    [["GetRecords", "SubscribeToShard"], POLLS],
  ],
  firehose: [[["PutRecord", "PutRecordBatch"], WRITES]],
  lambda: [[["InvokeFunction", "InvokeFunctionUrl"], { verb: "invokes" }]],
  states: [[["StartExecution", "StartSyncExecution"], { verb: "starts" }]],
  es: [
    [["ESHttpGet", "ESHttpHead"], READS],
    [["ESHttpPost", "ESHttpPut", "ESHttpPatch", "ESHttpDelete"], WRITES],
  ],
  "rds-db": [[["connect"], { verb: "connects" }]],
  "rds-data": [[["ExecuteStatement", "BatchExecuteStatement"], { verb: "queries" }]],
  elasticache: [[["Connect"], { verb: "connects" }]],
  "execute-api": [[["Invoke"], { verb: "calls" }]],
  appsync: [[["GraphQL"], { verb: "queries" }]],
  ecs: [[["RunTask"], { verb: "runs" }]],
};

/** The IAM services that act on a resource type, Terraform's (aws_s3_bucket) or CloudFormation's. */
const SERVICES: [RegExp, string[]][] = [
  [/^(aws_s3_|AWS::S3::)/, ["s3"]],
  [/^(aws_dynamodb_|AWS::DynamoDB::|AWS::Serverless::SimpleTable$)/, ["dynamodb"]],
  [/^(aws_sqs_|AWS::SQS::)/, ["sqs"]],
  [/^(aws_sns_|AWS::SNS::)/, ["sns"]],
  [/^(aws_cloudwatch_event_|AWS::Events::)/, ["events"]],
  [/^(aws_kinesis_firehose_|AWS::KinesisFirehose::)/, ["firehose"]],
  [/^(aws_kinesis_|AWS::Kinesis::)/, ["kinesis"]],
  [/^(aws_lambda_|AWS::Lambda::|AWS::Serverless::Function$)/, ["lambda"]],
  [/^(aws_sfn_|AWS::StepFunctions::|AWS::Serverless::StateMachine$)/, ["states"]],
  [/^(aws_opensearch_|aws_elasticsearch_|AWS::OpenSearchService::|AWS::Elasticsearch::)/, ["es"]],
  [/^(aws_rds_|aws_db_|AWS::RDS::)/, ["rds-db", "rds-data"]],
  [/^(aws_elasticache_|AWS::ElastiCache::)/, ["elasticache"]],
  [
    /^(aws_api_gateway_|aws_apigatewayv2_|AWS::ApiGateway(V2)?::|AWS::Serverless::(Http)?Api$)/,
    ["execute-api"],
  ],
  [/^(aws_appsync_|AWS::AppSync::)/, ["appsync"]],
  [/^(aws_ecs_|AWS::ECS::)/, ["ecs"]],
];

/**
 * Every flow an IAM action grants: `s3:Get*` reads, `sqs:*` enqueues and polls, `*` nothing. With
 * the target's resource type, an action of another service grants nothing on it, so a statement
 * that lists a bucket and a queue does not enqueue to the bucket. Types not in the table pass.
 */
export function accessOf(action: string, type?: string): Access[] {
  const [service = "", name = ""] = action.split(":");
  const owners = type ? SERVICES.find(([re]) => re.test(type))?.[1] : undefined;
  if (owners && !owners.includes(service.toLowerCase())) return [];
  const rules = ACTIONS[service.toLowerCase()] ?? [];
  // Action names are letters and digits; `*` and `?` are the only wildcards IAM knows.
  const glob = name
    .replace(/[^A-Za-z0-9*?-]/g, "")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  const pattern = new RegExp(`^${glob}$`, "i");
  return rules.filter(([names]) => names.some((n) => pattern.test(n))).map(([, a]) => a);
}

const PORTS: Record<number, string> = {
  80: "HTTP",
  443: "HTTPS",
  22: "SSH",
  25: "SMTP",
  53: "DNS",
  587: "SMTP",
  1433: "SQL Server",
  1521: "Oracle",
  2049: "NFS",
  3306: "MySQL",
  3389: "RDP",
  5432: "PostgreSQL",
  5671: "AMQPS",
  5672: "AMQP",
  6379: "Redis",
  9042: "Cassandra",
  9092: "Kafka",
  9094: "Kafka TLS",
  11211: "Memcached",
  27017: "MongoDB",
};

/**
 * "HTTPS" for 443, "PostgreSQL" for 5432, "HTTP :8080" for 8080, "TCP :7000-7010" for a range,
 * "ICMP" for ICMP (its ports are a type and code), and the protocol alone when a port is unknown.
 */
export function portLabel(from: number, to = from, protocol = "tcp"): string {
  const lower = protocol.toLowerCase();
  // Security groups also name protocols by number: 6 is TCP, 17 UDP, 1 ICMP and 58 ICMPv6.
  const p = lower === "6" ? "tcp" : lower === "17" ? "udp" : lower;
  if (p === "-1" || p === "all" || (from <= 0 && to >= 65535)) return "all traffic";
  if (p === "icmp" || p === "icmpv6" || p === "1" || p === "58") return "ICMP";
  if (!Number.isFinite(from) || !Number.isFinite(to)) return p === "udp" ? "UDP" : "TCP";
  if (from !== to) return `${p === "udp" ? "UDP" : "TCP"} :${from}-${to}`;
  const known = PORTS[from];
  if (known) return known;
  if (p === "http" || p === "https") return `${p.toUpperCase()} :${from}`;
  if (/^(8\d{3}|3000|5000|9000)$/.test(String(from))) return `HTTP :${from}`;
  return `${p === "udp" ? "UDP" : "TCP"} :${from}`;
}

const SCHEMES: Record<string, string> = {
  http: "HTTP",
  https: "HTTPS",
  ws: "WebSocket",
  wss: "WebSocket",
  grpc: "gRPC",
  postgres: "PostgreSQL",
  postgresql: "PostgreSQL",
  "jdbc:postgresql": "PostgreSQL",
  mysql: "MySQL",
  "jdbc:mysql": "MySQL",
  mariadb: "MariaDB",
  mongodb: "MongoDB",
  "mongodb+srv": "MongoDB",
  redis: "Redis",
  rediss: "Redis",
  amqp: "AMQP",
  amqps: "AMQP",
  kafka: "Kafka",
  nats: "NATS",
  memcached: "Memcached",
  sqlserver: "SQL Server",
  mssql: "SQL Server",
  "jdbc:sqlserver": "SQL Server",
};

export interface HostRef {
  host: string;
  /** The flow label the value implies: its URL scheme, else its port. */
  label?: string;
}

// Keys whose bare value names a host. Anything else needs a URL or host:port, so POSTGRES_USER:
// postgres is not read as a flow to the postgres service.
const HOST_KEY =
  /(HOST|HOSTNAME|HOSTS|SERVER|SERVERS|ADDR|ADDRESS|URL|URI|ENDPOINT|BROKERS?|DSN|UPSTREAM|SERVICE)$/i;

/** Hosts an environment value points at: URLs, host:port pairs and, for host-like keys, names. */
export function hostsIn(key: string, raw: string): HostRef[] {
  const value = raw.replace(/\$\{[A-Za-z_][A-Za-z0-9_]*:?-([^}]*)\}/g, "$1").replace(/\$\$/g, "$");
  const out: HostRef[] = [];
  for (const token of value.split(/[\s,;]+/).filter(Boolean)) {
    const url = token.match(/^([a-z][a-z0-9+.:-]*):\/\/(?:[^@/]*@)?([^/:?#@]+)(?::(\d+))?/i);
    if (url) {
      const scheme = (url[1] ?? "").toLowerCase();
      const port = url[3] ? Number(url[3]) : undefined;
      const label = SCHEMES[scheme] ?? (port ? portLabel(port) : undefined);
      out.push({ host: (url[2] ?? "").toLowerCase(), ...(label ? { label } : {}) });
      continue;
    }
    const pair = token.match(/^([a-z0-9][a-z0-9.-]*):(\d{2,5})$/i);
    if (pair) {
      out.push({ host: (pair[1] ?? "").toLowerCase(), label: portLabel(Number(pair[2])) });
      continue;
    }
    if (HOST_KEY.test(key) && /^[a-z0-9][a-z0-9.-]*$/i.test(token))
      out.push({ host: token.toLowerCase() });
  }
  return out;
}
