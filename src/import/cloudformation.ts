// orrery import cloudformation: a CloudFormation or SAM template (JSON or YAML), including `cdk synth` output to a spec, every node carrying the evidence it came from.
//
// Nodes are `Resources` by `Type`; boundaries are the stack's Region (from cdk.out/manifest.json
// when there is one), VPCs and subnets. Flows come only from what wires data: SAM `Events`, SAM
// policy templates and connectors, IAM statements whose `!Ref`, `!GetAtt` or `!Sub` resources pair
// a caller with a target, event source mappings, subscriptions, rule targets, API integrations,
// load balancer targets, CloudFront origins, bucket notifications, dead-letter queues and security
// group rules. Evidence is `template:line#LogicalId`, the form `orrery verify` reads.
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { accessOf, at, Draft, displayPath, humanize, portLabel } from "./iac.ts";
import {
  asList,
  isObj,
  lineOf,
  type Obj,
  readSources,
  readText,
  type Source,
  text,
} from "./source.ts";
import { AWS, awsBalancer, awsEngine, CFN_AWS, GLUE, type Kind } from "./tables.ts";
import type { Imported } from "./types.ts";

interface Stack {
  name: string;
  file: string;
  shown: string;
  src: Source;
  resources: Record<string, Obj>;
  region?: string;
  account?: string;
  sam: boolean;
  cdk: boolean;
}

/** SAM policy templates: the flow each grants, and the parameter that names its target. */
const SAM_POLICIES: Record<string, { verb: string; pull?: boolean }> = {
  DynamoDBCrudPolicy: { verb: "reads and writes" },
  DynamoDBReadPolicy: { verb: "reads" },
  DynamoDBWritePolicy: { verb: "writes" },
  SQSSendMessagePolicy: { verb: "enqueues" },
  SQSPollerPolicy: { verb: "polls", pull: true },
  SNSPublishMessagePolicy: { verb: "publishes" },
  S3ReadPolicy: { verb: "reads" },
  S3WritePolicy: { verb: "writes" },
  S3CrudPolicy: { verb: "reads and writes" },
  S3FullAccessPolicy: { verb: "reads and writes" },
  LambdaInvokePolicy: { verb: "invokes" },
  StepFunctionsExecutionPolicy: { verb: "starts" },
  EventBridgePutEventsPolicy: { verb: "sends events" },
  KinesisCrudPolicy: { verb: "writes" },
  KinesisStreamReadPolicy: { verb: "polls", pull: true },
  FirehoseWritePolicy: { verb: "writes" },
  FirehoseCrudPolicy: { verb: "writes" },
};

/** SAM event sources that a function pulls from or is pushed by, with the property naming it. */
const SAM_EVENTS: Record<string, { prop: string; verb: string }> = {
  SQS: { prop: "Queue", verb: "polls" },
  DynamoDB: { prop: "Stream", verb: "polls" },
  Kinesis: { prop: "Stream", verb: "polls" },
  MSK: { prop: "Stream", verb: "polls" },
  MQ: { prop: "Broker", verb: "polls" },
  DocumentDB: { prop: "Cluster", verb: "polls" },
  SNS: { prop: "Topic", verb: "delivers" },
  S3: { prop: "Bucket", verb: "object events" },
};

const NAME_PROPS = [
  "FunctionName",
  "TableName",
  "QueueName",
  "TopicName",
  "BucketName",
  "StateMachineName",
  "StreamName",
  "DeliveryStreamName",
  "DBClusterIdentifier",
  "DBInstanceIdentifier",
  "ReplicationGroupId",
  "ClusterName",
  "ServiceName",
  "AutoScalingGroupName",
  "DomainName",
  "Name",
];
const COMPUTE =
  /^AWS::(Lambda::Function|Serverless::Function|EC2::Instance|AutoScaling::AutoScalingGroup|ECS::Service|StepFunctions::StateMachine|Serverless::StateMachine|AppRunner::Service|Glue::Job)$/;
const CDK_HELPER =
  /^(Custom|LogRetention|BucketNotificationsHandler|AWS679f53fac002430cb0da5b7982bd2287)/;
const USERS = "users";

export async function importCloudFormation(path: string): Promise<Imported> {
  const stacks = readStacks(path);
  if (!stacks.length) throw new Error(`${path} has no CloudFormation template with Resources`);
  return new CloudFormation(stacks, path).run();
}

/** One template, or every `*.template.json` of a `cdk.out` folder, with manifest environments. */
function readStacks(path: string): Stack[] {
  const files = statSync(path).isDirectory()
    ? readdirSync(path)
        .filter((f) => f.endsWith(".template.json"))
        .sort()
        .map((f) => join(path, f))
    : [path];
  const manifest = join(statSync(path).isDirectory() ? path : dirname(path), "manifest.json");
  const envs = existsSync(manifest) ? environments(manifest) : {};
  const out: Stack[] = [];
  for (const file of files) {
    const src = readSources(file, { cfn: true })[0];
    const data = src?.data;
    if (!src || !isObj(data) || !isObj(data.Resources)) continue;
    const name = basename(file).replace(/\.template\.json$|\.(ya?ml|json|template)$/i, "");
    const env = envs[basename(file)] ?? envs[name];
    const transform = JSON.stringify(data.Transform ?? "");
    const resources = data.Resources as Record<string, Obj>;
    withGlobals(resources, data.Globals);
    out.push({
      name,
      file,
      shown: displayPath(file),
      src,
      resources,
      ...(env?.region ? { region: env.region } : {}),
      ...(env?.account ? { account: env.account } : {}),
      sam: transform.includes("AWS::Serverless"),
      cdk: Object.values(resources).some((r) => r.Type === "AWS::CDK::Metadata") || !!env,
    });
  }
  return out;
}

/**
 * SAM's Globals: `Globals.Function` applies to every AWS::Serverless::Function (and Api, HttpApi,
 * StateMachine ... to theirs) as SAM merges it. The resource's own values win, maps merge and
 * lists add up.
 */
function withGlobals(resources: Record<string, Obj>, globals: unknown) {
  if (!isObj(globals)) return;
  const intrinsic = (v: Obj) => Object.keys(v).some((k) => k === "Ref" || k.startsWith("Fn::"));
  const merge = (global: Obj, own: Obj): Obj => {
    const out: Obj = { ...global };
    for (const [k, v] of Object.entries(own)) {
      const g = global[k];
      out[k] =
        isObj(g) && isObj(v) && !intrinsic(g) && !intrinsic(v)
          ? merge(g, v)
          : Array.isArray(g) && Array.isArray(v)
            ? [...g, ...v]
            : v;
    }
    return out;
  };
  for (const r of Object.values(resources)) {
    const section = isObj(r) ? text(r.Type)?.match(/^AWS::Serverless::(\w+)$/)?.[1] : undefined;
    const shared = section ? globals[section] : undefined;
    if (isObj(r) && isObj(shared))
      r.Properties = merge(shared, isObj(r.Properties) ? r.Properties : {});
  }
}

/** `cdk.out/manifest.json`: each stack's template file and its `aws://account/region`. */
function environments(file: string): Record<string, { account?: string; region?: string }> {
  const out: Record<string, { account?: string; region?: string }> = {};
  let json: unknown;
  try {
    json = JSON.parse(readText(file));
  } catch {
    return out;
  }
  const artifacts = isObj(json) && isObj(json.artifacts) ? json.artifacts : {};
  for (const [name, a] of Object.entries(artifacts)) {
    if (!isObj(a) || a.type !== "aws:cloudformation:stack") continue;
    const m = (text(a.environment) ?? "").match(/^aws:\/\/([^/]+)\/(.+)$/);
    const props = isObj(a.properties) ? a.properties : {};
    const env = {
      ...(m?.[1] && !m[1].startsWith("unknown") ? { account: m[1] } : {}),
      ...(m?.[2] && !m[2].startsWith("unknown") ? { region: m[2] } : {}),
    };
    out[name] = env;
    const template = text(props.templateFile);
    if (template) out[template] = env;
  }
  return out;
}

class CloudFormation {
  readonly draft = new Draft();
  readonly stacks: Stack[];
  readonly path: string;
  /** Resource key (`Stack/LogicalId` when there are several stacks) to its stack and id. */
  readonly res = new Map<string, { stack: Stack; id: string; r: Obj }>();
  readonly kinds = new Map<string, Kind & { concept?: string }>();
  /** Glue that belongs to a node: launch templates, task definitions, instance profiles. */
  readonly parts = new Map<string, Set<string>>();
  /** Subnet keys to the group that draws them (copies across zones share one group). */
  readonly subnetGroup = new Map<string, string>();
  /** How many resources each node stands for: zone copies, cluster instances. */
  readonly copies = new Map<string, number>();

  constructor(stacks: Stack[], path: string) {
    this.stacks = stacks;
    this.path = path;
    for (const stack of stacks)
      for (const [id, r] of Object.entries(stack.resources))
        if (isObj(r)) this.res.set(this.key(stack, id), { stack, id, r });
  }

  run(): Imported {
    for (const key of this.res.keys()) this.classify(key);
    this.foldParts();
    this.boundaries();
    this.zoneCopies();
    for (const key of this.kinds.keys()) this.place(key);
    this.samFlows();
    this.wiringFlows();
    this.iamFlows();
    this.securityGroupFlows();
    this.throughGateways();
    const first = this.stacks[0] as Stack;
    const flavor = first.sam ? "SAM template" : first.cdk ? "CDK app" : "CloudFormation template";
    const drawn = [...this.draft.nodes.keys()].filter((k) => k !== USERS).length;
    return this.draft.write({
      title: titleOf(this.path, first),
      subtitle: `From a ${flavor}: ${drawn} resources drawn, ${this.draft.leftOut.size} left out`,
      command: `orrery import cloudformation ${displayPath(this.path)}`,
      legend: { dashed: "Outbound through NAT" },
    });
  }

  // ---------------------------------------------------------------- references

  key(stack: Stack, id: string): string {
    return this.stacks.length > 1 ? `${stack.name}/${id}` : id;
  }

  type(key: string): string {
    return text(this.res.get(key)?.r.Type) ?? "";
  }

  props(key: string): Obj {
    const p = this.res.get(key)?.r.Properties;
    return isObj(p) ? p : {};
  }

  /** Resource keys a value references through Ref, Fn::GetAtt and Fn::Sub, in its own stack. */
  refs(stack: Stack, v: unknown, types?: RegExp): string[] {
    const ids = new Set<string>();
    const walk = (x: unknown) => {
      if (Array.isArray(x)) return x.forEach(walk);
      if (!isObj(x)) return;
      for (const [k, val] of Object.entries(x)) {
        if (k === "Ref" && typeof val === "string") ids.add(val);
        else if (k === "Fn::GetAtt")
          ids.add(String(Array.isArray(val) ? val[0] : (text(val) ?? "").split(".")[0]));
        else if (k === "Fn::Sub") {
          const [template, vars] = Array.isArray(val) ? val : [val, undefined];
          for (const m of String(template ?? "").matchAll(/\$\{([A-Za-z0-9]+)(\.[^}]*)?\}/g))
            if (m[1]) ids.add(m[1]);
          walk(vars);
        } else walk(val);
      }
    };
    walk(v);
    return [...ids]
      .filter((id) => isObj(stack.resources[id]))
      .map((id) => this.key(stack, id))
      .filter((k) => !types || types.test(this.type(k)));
  }

  /** Values at a dotted property path, through lists. */
  pick(key: string, path: string): unknown[] {
    let level: unknown[] = [this.props(key)];
    for (const step of path.split("."))
      level = level.flat().map((x) => (isObj(x) ? x[step] : undefined));
    return level.flat().filter((x) => x !== undefined && x !== null);
  }

  /** Resource keys a property path points at. */
  targets(key: string, path: string, types?: RegExp): string[] {
    const stack = this.res.get(key)?.stack;
    return stack ? this.refs(stack, this.pick(key, path), types) : [];
  }

  /** `template:line#Ident` for a resource, or for a path inside it. */
  where(key: string, path: (string | number)[] = [], ident?: string): string {
    const entry = this.res.get(key);
    if (!entry) return key;
    const line = lineOf(entry.stack.src, ["Resources", entry.id, ...path]);
    const last = path.at(-1);
    return at(entry.stack.shown, line, ident ?? (typeof last === "string" ? last : entry.id));
  }

  // ---------------------------------------------------------------- nodes

  private classify(key: string) {
    const type = this.type(key);
    const entry = this.res.get(key);
    const cdkPath = text(isObj(entry?.r.Metadata) ? entry.r.Metadata["aws:cdk:path"] : undefined);
    if (
      /Function$/.test(type) &&
      (CDK_HELPER.test(entry?.id ?? "") || cdkPath?.includes("/Custom::"))
    )
      return this.draft.leave(key, "function the deployment runs, not the app");
    if (type === "AWS::RDS::DBInstance" && this.props(key).DBClusterIdentifier)
      return this.draft.leave(key, "instance of a cluster; counted in its badge");
    const kind = this.kindOf(key);
    if (kind) return void this.kinds.set(key, kind);
    if (/^AWS::EC2::(VPC|Subnet)$/.test(type)) return;
    if (type === "AWS::Serverless::Connector")
      return this.draft.leave(key, "drawn as the flow it grants");
    const glue = GLUE.find(([re]) => re.test(type));
    if (glue) return this.draft.leave(key, glue[1]);
    this.draft.leave(key, "no icon for this type in the import table");
    this.draft.warn(`${key}: ${type} is not in the import table, so it is not drawn`);
  }

  private kindOf(key: string): (Kind & { concept?: string }) | undefined {
    const type = this.type(key);
    const p = this.props(key);
    let concept = CFN_AWS[type];
    if (!concept) return undefined;
    if (type === "AWS::ElasticLoadBalancingV2::LoadBalancer") concept = awsBalancer(text(p.Type));
    if (type === "AWS::ApiGatewayV2::Api" && text(p.ProtocolType) === "WEBSOCKET")
      concept = "websocketApi";
    if (/^AWS::(ElastiCache|RDS)::/.test(type)) concept = awsEngine(concept, text(p.Engine));
    const kind = AWS[concept];
    return kind ? { ...kind, concept } : undefined;
  }

  private foldParts() {
    const add = (part: string, node: string) => {
      const set = this.parts.get(part) ?? new Set<string>();
      set.add(node);
      this.parts.set(part, set);
    };
    for (const key of this.res.keys()) {
      const type = this.type(key);
      if (type === "AWS::AutoScaling::AutoScalingGroup")
        for (const path of ["LaunchTemplate.LaunchTemplateId", "LaunchConfigurationName"])
          for (const t of this.targets(key, path)) add(t, key);
      if (type === "AWS::ECS::Service")
        for (const t of this.targets(key, "TaskDefinition")) add(t, key);
      if (type === "AWS::RDS::DBInstance")
        for (const c of this.targets(key, "DBClusterIdentifier", /^AWS::RDS::DBCluster$/)) {
          add(key, c);
          this.copies.set(c, (this.copies.get(c) ?? 0) + 1);
        }
    }
    for (const key of this.res.keys())
      for (const path of [
        "IamInstanceProfile",
        "LaunchTemplateData.IamInstanceProfile.Arn",
        "LaunchTemplateData.IamInstanceProfile.Name",
      ])
        for (const p of this.targets(key, path, /^AWS::IAM::InstanceProfile$/))
          for (const n of this.nodesFor(key)) add(p, n);
  }

  /**
   * Resources that differ only by a zone number (PublicSubnet1NATGateway, PublicSubnet2NATGateway)
   * and sit in the same subnet group are one node with a badge, as Terraform's count copies are.
   */
  private zoneCopies() {
    const sets = new Map<string, string[]>();
    for (const key of this.kinds.keys()) {
      const id = bare(this.res.get(key)?.id ?? key);
      if (!/\d/.test(id)) continue;
      const set = `${this.type(key)}\u0000${id.replace(/\d+/g, "#")}`;
      sets.set(set, [...(sets.get(set) ?? []), key]);
    }
    for (const members of sets.values()) {
      const places = members.map((m) =>
        [...new Set(this.subnetsOf(m).map((s) => this.subnetGroup.get(s)))].sort().join(" "),
      );
      const [first, ...rest] = members;
      if (!first || !rest.length || !places[0] || places.some((p) => p !== places[0])) continue;
      this.copies.set(first, members.length);
      for (const other of rest) {
        this.kinds.delete(other);
        this.parts.set(other, new Set([first]));
        this.draft.leave(other, `copy of ${first} in another zone; counted in its badge`);
      }
    }
  }

  nodesFor(key: string): string[] {
    if (this.kinds.has(key)) return [key];
    return [...(this.parts.get(key) ?? [])].filter((k) => this.kinds.has(k));
  }

  private place(key: string) {
    const kind = this.kinds.get(key);
    const entry = this.res.get(key);
    if (!kind || !entry) return;
    const p = this.props(key);
    let what = kind.what;
    if (typeof p.ScheduleExpression === "string") what = p.ScheduleExpression;
    const min = text(p.MinSize);
    if (entry.r.Type === "AWS::AutoScaling::AutoScalingGroup" && min)
      what = `${what}, ${min} to ${text(p.MaxSize) ?? min}`;
    const tasks = Number(p.DesiredCount);
    if (entry.r.Type === "AWS::ECS::Service" && tasks > 0)
      what = `${what}, ${tasks} task${tasks > 1 ? "s" : ""}`;
    const parent = this.parentOf(key, kind);
    const copies = this.copies.get(key) ?? 1;
    this.draft.node(key, {
      icon: kind.icon,
      name: this.nameOf(key),
      what,
      hint: this.hintOf(key, copies > 1),
      ...(parent ? { parent } : {}),
      copies,
      evidence: [
        this.where(key),
        ...[...this.parts]
          .filter(
            ([part, nodes]) => nodes.has(key) && this.draft.leftOut.get(part)?.includes("badge"),
          )
          .map(([part]) => this.where(part)),
      ],
    });
  }

  /** An id to start from: the CDK construct's name, else the logical id without its hash. */
  hintOf(key: string, copies: boolean): string {
    const entry = this.res.get(key);
    const cdkPath = text(isObj(entry?.r.Metadata) ? entry.r.Metadata["aws:cdk:path"] : undefined);
    const construct = cdkPath
      ?.split("/")
      .slice(1)
      .filter((s) => s && s !== "Resource" && s !== "Default")
      .at(-1);
    const id = construct ?? bare(entry?.id ?? key);
    return copies ? id.replace(/\d+/g, "") : id;
  }

  /** A literal name property, else the construct's name from the CDK path, else the logical id. */
  nameOf(key: string): string {
    const entry = this.res.get(key);
    const p = this.props(key);
    for (const prop of NAME_PROPS) {
      const v = p[prop];
      if (typeof v === "string" && v && !(prop === "DomainName" && v.includes("."))) return v;
    }
    const cdkPath = text(isObj(entry?.r.Metadata) ? entry.r.Metadata["aws:cdk:path"] : undefined);
    const construct = cdkPath
      ?.split("/")
      .filter((s) => s && s !== "Resource" && s !== "Default")
      .at(-1);
    return humanize(construct ?? bare(entry?.id ?? key));
  }

  // ---------------------------------------------------------------- boundaries

  private regionGroup(stack: Stack): string {
    const byAccount = new Set(this.stacks.map((s) => s.account).filter(Boolean)).size > 1;
    this.draft.group("aws", {
      type: "aws:cloud",
      label: "AWS Cloud",
      hint: "cloud",
      evidence: [stack.shown],
    });
    let parent = "aws";
    if (byAccount && stack.account)
      parent = this.draft.group(`account:${stack.account}`, {
        type: "aws:account",
        label: `Account ${stack.account}`,
        parent: "aws",
        hint: `account-${stack.account}`,
        evidence: [stack.shown],
      });
    return this.draft.group(`region:${stack.account ?? ""}:${stack.region ?? ""}`, {
      type: "aws:region",
      label: stack.region ?? "Region",
      parent,
      hint: stack.region ?? "region",
      evidence: [stack.region ? `${stack.shown}#${stack.name}` : stack.shown],
    });
  }

  private boundaries() {
    for (const [key, { stack }] of this.res) {
      if (this.type(key) !== "AWS::EC2::VPC") continue;
      const cidr = text(this.props(key).CidrBlock);
      this.draft.group(key, {
        type: "aws:vpc",
        label: cidr ? `VPC ${cidr}` : `VPC (${this.nameOf(key)})`,
        parent: this.regionGroup(stack),
        hint: bare(this.res.get(key)?.id ?? "vpc"),
        evidence: [this.where(key)],
      });
    }
    // Subnets that differ only by zone (PublicSubnet1, PublicSubnet2, or one CDK subnet group)
    // are one group, as Terraform's count copies are.
    const sets = new Map<string, string[]>();
    for (const [key, { id }] of this.res) {
      if (this.type(key) !== "AWS::EC2::Subnet") continue;
      const vpc = this.targets(key, "VpcId", /^AWS::EC2::VPC$/)[0] ?? "";
      const tag = this.tag(key, "aws-cdk:subnet-name");
      const base =
        tag ??
        bare(id)
          .replace(/\d+/g, "")
          .replace(/Subnet[A-Z]$/, "Subnet");
      const set = `${vpc}\u0000${this.isPublic(key) ? "public" : "private"}\u0000${base}`;
      sets.set(set, [...(sets.get(set) ?? []), key]);
    }
    for (const [set, members] of sets) {
      const [vpc = "", kind = "", base = ""] = set.split("\u0000");
      const first = members[0] as string;
      const stack = this.res.get(first)?.stack as Stack;
      const isPublic = kind === "public";
      const role = humanize(base)
        .toLowerCase()
        .replace(/\b(vpc|public|private|subnets?)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const many = members.length > 1;
      const group = this.draft.group(`subnets:${set}`, {
        type: isPublic ? "aws:public-subnet" : "aws:private-subnet",
        label: `${isPublic ? "Public" : "Private"} subnet${many ? "s" : ""}${role ? ` (${role})` : ""}`,
        parent: vpc && this.draft.groups.has(vpc) ? vpc : this.regionGroup(stack),
        hint: `${slugOf(base || kind)}-subnet`,
        evidence: members.map((m) => this.where(m)),
      });
      for (const m of members) this.subnetGroup.set(m, group);
    }
  }

  tag(key: string, name: string): string | undefined {
    for (const t of asList(this.props(key).Tags))
      if (isObj(t) && t.Key === name) return text(t.Value);
    return undefined;
  }

  /** A public subnet maps public addresses, is tagged Public by CDK, or routes to an internet gateway. */
  isPublic(key: string): boolean {
    const p = this.props(key);
    const cdk = this.tag(key, "aws-cdk:subnet-type");
    if (cdk) return cdk === "Public";
    if (p.MapPublicIpOnLaunch === true || p.MapPublicIpOnLaunch === "true") return true;
    return this.routesOf(key).igw.length > 0;
  }

  /** Where a subnet's default route goes. */
  routesOf(subnet: string): { igw: string[]; nat: string[]; evidence: string[] } {
    const out = { igw: [] as string[], nat: [] as string[], evidence: [] as string[] };
    for (const assoc of this.res.keys()) {
      if (this.type(assoc) !== "AWS::EC2::SubnetRouteTableAssociation") continue;
      if (!this.targets(assoc, "SubnetId").includes(subnet)) continue;
      for (const rt of this.targets(assoc, "RouteTableId"))
        for (const route of this.res.keys()) {
          if (this.type(route) !== "AWS::EC2::Route") continue;
          if (!this.targets(route, "RouteTableId").includes(rt)) continue;
          const igw = this.targets(route, "GatewayId", /^AWS::EC2::InternetGateway$/);
          const nat = this.targets(route, "NatGatewayId", /^AWS::EC2::NatGateway$/);
          if (igw.length || nat.length) out.evidence.push(this.where(route), this.where(assoc));
          out.igw.push(...igw);
          out.nat.push(...nat);
        }
    }
    return out;
  }

  subnetsOf(key: string): string[] {
    const subnet = /^AWS::EC2::Subnet$/;
    const out = new Set<string>();
    for (const path of [
      "SubnetId",
      "SubnetIds",
      "Subnets",
      "VPCZoneIdentifier",
      "VpcConfig.SubnetIds",
      "VPCOptions.SubnetIds",
      "ResourcesVpcConfig.SubnetIds",
      "NetworkConfiguration.AwsvpcConfiguration.Subnets",
      "VpcConfiguration.SubnetIds",
      "BrokerNodeGroupInfo.ClientSubnets",
      "SubnetMappings.SubnetId",
    ])
      for (const s of this.targets(key, path, subnet)) out.add(s);
    for (const path of ["DBSubnetGroupName", "CacheSubnetGroupName"])
      for (const g of this.targets(key, path))
        for (const s of this.targets(g, "SubnetIds", subnet)) out.add(s);
    return [...out];
  }

  private parentOf(key: string, kind: Kind): string | undefined {
    const stack = this.res.get(key)?.stack as Stack;
    const region = this.regionGroup(stack);
    if (kind.global) return "aws";
    const groups = this.subnetsOf(key)
      .map((s) => this.subnetGroup.get(s))
      .filter((g): g is string => !!g);
    if (groups.length) return this.draft.commonGroup(groups);
    const vpc = this.targets(key, "VpcId", /^AWS::EC2::VPC$/)[0] ?? this.attachedVpc(key);
    if (vpc && this.draft.groups.has(vpc)) return vpc;
    return region;
  }

  /** An internet gateway sits in the VPC it is attached to. */
  private attachedVpc(key: string): string | undefined {
    for (const a of this.res.keys())
      if (
        this.type(a) === "AWS::EC2::VPCGatewayAttachment" &&
        this.targets(a, "InternetGatewayId").includes(key)
      )
        return this.targets(a, "VpcId")[0];
    return undefined;
  }

  // ---------------------------------------------------------------- flows

  private flow(from: string, to: string, label: string | undefined, evidence: string[]) {
    for (const f of this.nodesFor(from))
      for (const t of this.nodesFor(to)) this.draft.edge(f, t, label, evidence);
  }

  private fromUsers(to: string, label: string, evidence: string[]) {
    const users = AWS.users;
    if (!users || !this.kinds.has(to)) return;
    this.draft.node(USERS, { icon: users.icon, name: "Users", what: "", hint: "users", evidence });
    this.draft.edge(USERS, to, label, evidence);
  }

  /** A node SAM creates from an event (an implicit API, a schedule, a rule). */
  private implied(
    key: string,
    concept: string,
    name: string,
    what: string,
    evidence: string[],
    stack: Stack,
  ) {
    const kind = AWS[concept];
    if (!kind) return key;
    this.kinds.set(key, { ...kind, concept });
    this.draft.node(key, {
      icon: kind.icon,
      name,
      what,
      hint: bare(key.split("/").at(-1) ?? key),
      parent: this.regionGroup(stack),
      evidence,
    });
    return key;
  }

  private samFlows() {
    for (const [key, { stack }] of this.res) {
      if (this.type(key) !== "AWS::Serverless::Function") continue;
      const events = this.props(key).Events;
      for (const [name, e] of Object.entries(isObj(events) ? events : {})) {
        if (!isObj(e)) continue;
        const type = text(e.Type) ?? "";
        const p = isObj(e.Properties) ? e.Properties : {};
        const ev = [this.where(key, ["Properties", "Events", name])];
        const source = SAM_EVENTS[type];
        if (source)
          for (const s of this.refs(stack, p[source.prop])) this.flow(s, key, source.verb, ev);
        if (type === "Api" || type === "HttpApi") {
          const explicit = this.refs(stack, type === "Api" ? p.RestApiId : p.ApiId)[0];
          const api =
            explicit ??
            this.implied(
              this.key(stack, type === "Api" ? "ServerlessRestApi" : "ServerlessHttpApi"),
              type === "Api" ? "restApi" : "httpApi",
              type === "Api" ? "ServerlessRestApi" : "ServerlessHttpApi",
              "",
              ev,
              stack,
            );
          const route = [text(p.Method)?.toUpperCase(), text(p.Path)].filter(Boolean).join(" ");
          this.flow(api, key, route || undefined, ev);
          this.fromUsers(api, "HTTPS", ev);
        }
        if (type === "Schedule" || type === "ScheduleV2") {
          const expr = text(p.Schedule) ?? text(p.ScheduleExpression) ?? "Schedule";
          const node = this.implied(`${key}/${name}`, "schedule", humanize(name), expr, ev, stack);
          this.flow(node, key, "triggers", ev);
        }
        if (type === "EventBridgeRule" || type === "CloudWatchEvent") {
          const node = this.implied(
            `${key}/${name}`,
            "rule",
            humanize(name),
            "Event pattern",
            ev,
            stack,
          );
          for (const bus of this.refs(stack, p.EventBusName)) this.flow(bus, node, "matches", ev);
          this.flow(node, key, "triggers", ev);
        }
      }
      if (isObj(this.props(key).FunctionUrlConfig))
        this.fromUsers(key, "HTTPS", [this.where(key, ["Properties", "FunctionUrlConfig"])]);
    }
    for (const [key, { stack }] of this.res) {
      const type = this.type(key);
      if (type === "AWS::Serverless::Function" || type === "AWS::Serverless::StateMachine")
        asList(this.props(key).Policies).forEach((policy, i) => {
          if (!isObj(policy)) return;
          for (const [template, params] of Object.entries(policy)) {
            const grant = SAM_POLICIES[template];
            const ev = [this.where(key, ["Properties", "Policies", i], template)];
            if (grant)
              for (const t of this.refs(stack, params))
                if (grant.pull) this.flow(t, key, grant.verb, ev);
                else this.flow(key, t, grant.verb, ev);
          }
          this.statementFlows(stack, [key], policy.Statement, key, [
            "Properties",
            "Policies",
            i,
            "Statement",
          ]);
        });
      if (type === "AWS::Serverless::Connector") {
        // A connector names its ends by logical id: Source: { Id: Fn }, Destination: { Id: Table }.
        const p = this.props(key);
        const end = (v: unknown) => this.refs(stack, isObj(v) ? { Ref: v.Id } : undefined);
        const perms = asList(p.Permissions).map(text);
        const verb = ["Read", "Write"]
          .filter((x) => perms.includes(x))
          .map((x) => (x === "Read" ? "reads" : "writes"))
          .join(" and ");
        for (const s of end(p.Source))
          for (const d of end(p.Destination)) this.flow(s, d, verb || "calls", [this.where(key)]);
      }
    }
  }

  private wiringFlows() {
    const all = [...this.res.keys()];
    const of = (type: string) => all.filter((k) => this.type(k) === type);
    for (const k of of("AWS::Lambda::EventSourceMapping"))
      for (const s of this.targets(k, "EventSourceArn"))
        for (const fn of this.targets(k, "FunctionName"))
          this.flow(s, fn, "polls", [this.where(k)]);
    for (const k of of("AWS::SNS::Subscription"))
      for (const topic of this.targets(k, "TopicArn"))
        for (const t of this.targets(k, "Endpoint"))
          this.flow(topic, t, "delivers", [this.where(k)]);
    for (const k of of("AWS::SNS::Topic"))
      asList(this.props(k).Subscription).forEach((s, i) => {
        const stack = this.res.get(k)?.stack as Stack;
        const ev = [this.where(k, ["Properties", "Subscription", i, "Endpoint"])];
        for (const t of this.refs(stack, isObj(s) ? s.Endpoint : undefined))
          this.flow(k, t, "delivers", ev);
      });
    for (const k of of("AWS::Events::Rule")) {
      asList(this.props(k).Targets).forEach((t, i) => {
        const stack = this.res.get(k)?.stack as Stack;
        const ev = [this.where(k, ["Properties", "Targets", i, "Arn"])];
        for (const target of this.refs(stack, isObj(t) ? t.Arn : undefined))
          this.flow(k, target, "triggers", ev);
      });
      for (const bus of this.targets(k, "EventBusName"))
        this.flow(bus, k, "matches", [this.where(k)]);
    }
    for (const k of of("AWS::Scheduler::Schedule"))
      for (const t of this.targets(k, "Target.Arn")) this.flow(k, t, "triggers", [this.where(k)]);

    // APIs: integrations, labelled with the routes that point at them.
    for (const i of of("AWS::ApiGatewayV2::Integration")) {
      const routes = of("AWS::ApiGatewayV2::Route").filter((r) =>
        this.targets(r, "Target").includes(i),
      );
      const label = routes
        .map((r) => text(this.props(r).RouteKey))
        .filter(Boolean)
        .join(", ");
      for (const api of this.targets(i, "ApiId"))
        for (const t of this.targets(i, "IntegrationUri"))
          this.flow(api, t, label || undefined, [
            this.where(i),
            ...routes.map((r) => this.where(r)),
          ]);
    }
    for (const m of of("AWS::ApiGateway::Method")) {
      const p = this.props(m);
      const resource = this.targets(m, "ResourceId", /^AWS::ApiGateway::Resource$/)[0];
      const part = resource ? text(this.props(resource).PathPart) : undefined;
      const label = [text(p.HttpMethod), `/${part ?? ""}`].filter(Boolean).join(" ");
      for (const api of this.targets(m, "RestApiId"))
        for (const t of this.targets(m, "Integration.Uri"))
          this.flow(api, t, label, [this.where(m)]);
    }
    for (const k of all)
      if (
        /^AWS::(ApiGateway::RestApi|ApiGatewayV2::Api|Serverless::Api|Serverless::HttpApi)$/.test(
          this.type(k),
        )
      )
        this.fromUsers(k, "HTTPS", [this.where(k)]);
    for (const k of of("AWS::Lambda::Url"))
      for (const fn of this.targets(k, "TargetFunctionArn"))
        this.fromUsers(fn, "HTTPS", [this.where(k)]);

    // Load balancers: listener, target group, then what the group sends traffic to.
    const behind = (tg: string): string[] =>
      all.filter(
        (k) =>
          this.targets(k, "TargetGroupARNs").includes(tg) ||
          this.targets(k, "LoadBalancers.TargetGroupArn").includes(tg),
      );
    for (const l of of("AWS::ElasticLoadBalancingV2::Listener")) {
      const tgs = new Set([
        ...this.targets(l, "DefaultActions.TargetGroupArn"),
        ...this.targets(l, "DefaultActions.ForwardConfig.TargetGroups.TargetGroupArn"),
      ]);
      for (const r of of("AWS::ElasticLoadBalancingV2::ListenerRule"))
        if (this.targets(r, "ListenerArn").includes(l))
          for (const t of this.targets(r, "Actions.TargetGroupArn")) tgs.add(t);
      const lbs = this.targets(l, "LoadBalancerArn");
      for (const tg of tgs) {
        const p = this.props(tg);
        const port = Number(p.Port);
        const label = port ? portLabel(port, port, text(p.Protocol)) : undefined;
        const targets = [...behind(tg), ...this.targets(tg, "Targets.Id")];
        for (const lb of lbs)
          for (const t of targets) this.flow(lb, t, label, [this.where(l), this.where(tg)]);
      }
      const port = Number(this.props(l).Port) || 443;
      for (const lb of lbs)
        if (text(this.props(lb).Scheme) !== "internal")
          this.fromUsers(lb, portLabel(port, port, text(this.props(l).Protocol)), [
            this.where(lb),
            this.where(l),
          ]);
    }

    for (const d of of("AWS::CloudFront::Distribution")) {
      this.fromUsers(d, "HTTPS", [this.where(d)]);
      for (const o of this.targets(d, "DistributionConfig.Origins.DomainName"))
        this.flow(d, o, "origin", [this.where(d, ["Properties", "DistributionConfig", "Origins"])]);
    }
    for (const k of all) {
      const type = this.type(k);
      if (type !== "AWS::S3::Bucket" && type !== "Custom::S3BucketNotifications") continue;
      const bucket = type === "AWS::S3::Bucket" ? [k] : this.targets(k, "BucketName");
      for (const path of [
        "NotificationConfiguration.LambdaConfigurations.Function",
        "NotificationConfiguration.QueueConfigurations.Queue",
        "NotificationConfiguration.TopicConfigurations.Topic",
      ])
        for (const t of this.targets(k, path))
          for (const b of bucket)
            this.flow(b, t, "object events", [
              this.where(k, ["Properties", "NotificationConfiguration"]),
            ]);
    }
    for (const q of of("AWS::SQS::Queue"))
      for (const dlq of this.targets(q, "RedrivePolicy.deadLetterTargetArn"))
        this.flow(q, dlq, "dead letters", [this.where(q, ["Properties", "RedrivePolicy"])]);
    for (const k of all) {
      if (!/^AWS::(StepFunctions|Serverless)::StateMachine$/.test(this.type(k))) continue;
      const found = new Set([
        ...this.targets(k, "Definition"),
        ...this.targets(k, "DefinitionString"),
        ...this.targets(k, "DefinitionSubstitutions"),
      ]);
      for (const t of found) this.flow(k, t, verbFor(this.type(t)), [this.where(k)]);
    }
    for (const f of of("AWS::KinesisFirehose::DeliveryStream")) {
      for (const s of this.targets(f, "KinesisStreamSourceConfiguration.KinesisStreamARN"))
        this.flow(s, f, "polls", [this.where(f)]);
      for (const path of [
        "ExtendedS3DestinationConfiguration.BucketARN",
        "S3DestinationConfiguration.BucketARN",
      ])
        for (const b of this.targets(f, path)) this.flow(f, b, "delivers", [this.where(f)]);
    }
    for (const p of of("AWS::Pipes::Pipe"))
      for (const s of this.targets(p, "Source"))
        for (const t of this.targets(p, "Target")) this.flow(s, t, "pipe", [this.where(p)]);
  }

  /** IAM roles, their users, and the statements of their policies. */
  private iamFlows() {
    const users = new Map<string, Set<string>>();
    const use = (role: string, node: string) => {
      const set = users.get(role) ?? new Set<string>();
      set.add(node);
      users.set(role, set);
    };
    const role = /^AWS::IAM::Role$/;
    for (const key of this.res.keys()) {
      const nodes = this.nodesFor(key).filter((n) => COMPUTE.test(this.type(n)));
      const paths =
        this.type(key) === "AWS::ECS::TaskDefinition" ? ["TaskRoleArn"] : ["Role", "RoleArn"];
      for (const n of nodes)
        for (const p of paths) for (const r of this.targets(key, p, role)) use(r, n);
    }
    for (const p of this.res.keys())
      if (this.type(p) === "AWS::IAM::InstanceProfile")
        for (const r of this.targets(p, "Roles", role)) for (const n of this.nodesFor(p)) use(r, n);
    for (const [key, { stack }] of this.res) {
      const type = this.type(key);
      if (type === "AWS::IAM::Role") {
        const callers = [...(users.get(key) ?? [])];
        asList(this.props(key).Policies).forEach((policy, i) => {
          const doc = isObj(policy) ? policy.PolicyDocument : undefined;
          this.statementFlows(stack, callers, isObj(doc) ? doc.Statement : undefined, key, [
            "Properties",
            "Policies",
            i,
            "PolicyDocument",
            "Statement",
          ]);
        });
      }
      if (type === "AWS::IAM::Policy" || type === "AWS::IAM::ManagedPolicy") {
        const roles = this.targets(key, "Roles", role);
        // A role can attach a managed policy itself, as CDK's addManagedPolicy writes it.
        if (type === "AWS::IAM::ManagedPolicy")
          for (const r of this.res.keys())
            if (
              this.type(r) === "AWS::IAM::Role" &&
              this.targets(r, "ManagedPolicyArns").includes(key)
            )
              roles.push(r);
        const callers = roles.flatMap((r) => [...(users.get(r) ?? [])]);
        const doc = this.props(key).PolicyDocument;
        this.statementFlows(stack, callers, isObj(doc) ? doc.Statement : undefined, key, [
          "Properties",
          "PolicyDocument",
          "Statement",
        ]);
      }
    }
  }

  /**
   * Allow statements: each action's flow from every caller to every resource it references. The
   * evidence is the line the action is written on (`base` is the path to the statement list).
   */
  private statementFlows(
    stack: Stack,
    callers: string[],
    statements: unknown,
    key: string,
    base: (string | number)[],
  ) {
    asList(statements).forEach((s, i) => {
      if (!isObj(s) || (text(s.Effect) ?? "Allow") !== "Allow") return;
      const targets = this.refs(stack, s.Resource);
      asList(s.Action).forEach((a, k) => {
        const action = text(a);
        if (!action) return;
        const ev = [
          this.where(key, [...base, i, "Action", ...(Array.isArray(s.Action) ? [k] : [])], action),
        ];
        for (const t of targets)
          for (const access of accessOf(action, this.type(t)))
            for (const target of this.nodesFor(t))
              for (const c of callers) {
                if (c === target) continue;
                if (access.pull) this.draft.edge(target, c, access.verb, ev);
                else this.draft.edge(c, target, access.verb, ev);
              }
      });
    });
  }

  private securityGroupFlows() {
    const sg = /^AWS::EC2::SecurityGroup$/;
    const members = new Map<string, Set<string>>();
    for (const key of this.res.keys()) {
      const nodes = this.nodesFor(key);
      if (!nodes.length) continue;
      for (const path of [
        "SecurityGroupIds",
        "SecurityGroups",
        "VpcSecurityGroupIds",
        "VPCSecurityGroups",
        "VpcConfig.SecurityGroupIds",
        "VPCOptions.SecurityGroupIds",
        "BrokerNodeGroupInfo.SecurityGroups",
        "ResourcesVpcConfig.SecurityGroupIds",
        "NetworkConfiguration.AwsvpcConfiguration.SecurityGroups",
        "LaunchTemplateData.SecurityGroupIds",
        "LaunchTemplateData.NetworkInterfaces.Groups",
      ])
        for (const g of this.targets(key, path, sg)) {
          const set = members.get(g) ?? new Set<string>();
          for (const n of nodes) set.add(n);
          members.set(g, set);
        }
    }
    const allow = (target: string, rule: Obj, stack: Stack, ev: string) => {
      // A port can be a parameter (`!Ref DbPort`): its Default, else unknown, so the label names
      // the protocol alone.
      const params = isObj(stack.src.data) ? stack.src.data.Parameters : undefined;
      const port = (v: unknown) => {
        const ref = isObj(v) ? text(v.Ref) : undefined;
        const param = ref && isObj(params) ? params[ref] : undefined;
        return Number(ref ? (isObj(param) ? param.Default : undefined) : v);
      };
      const from = port(rule.FromPort ?? 0);
      const to = port(rule.ToPort ?? rule.FromPort ?? 0);
      const label = portLabel(from, to, text(rule.IpProtocol));
      const world = rule.CidrIp === "0.0.0.0/0" || rule.CidrIpv6 === "::/0";
      for (const t of members.get(target) ?? []) {
        if (world) this.fromUsers(t, label, [ev]);
        for (const s of this.refs(stack, rule.SourceSecurityGroupId, sg))
          for (const f of members.get(s) ?? []) if (f !== t) this.draft.edge(f, t, label, [ev]);
      }
    };
    for (const [key, { stack }] of this.res) {
      if (this.type(key) === "AWS::EC2::SecurityGroup")
        asList(this.props(key).SecurityGroupIngress).forEach((r, i) => {
          if (isObj(r))
            allow(
              key,
              r,
              stack,
              this.where(key, ["Properties", "SecurityGroupIngress", i, "FromPort"]),
            );
        });
      if (this.type(key) === "AWS::EC2::SecurityGroupIngress")
        for (const g of this.targets(key, "GroupId", sg))
          allow(g, this.props(key), stack, this.where(key));
    }
  }

  /** Traffic from the internet into a VPC enters through its internet gateway. */
  private throughGateways() {
    const igws = [...this.draft.nodes.values()].filter(
      (n) => this.type(n.key) === "AWS::EC2::InternetGateway",
    );
    for (const e of [...this.draft.edges.values()]) {
      if (e.from !== USERS) continue;
      const vpc = this.draft
        .ancestors(this.draft.nodes.get(e.to)?.parent)
        .find((g) => this.draft.groups.get(g)?.type === "aws:vpc");
      const igw = vpc && igws.find((n) => this.draft.ancestors(n.parent).includes(vpc));
      if (!igw || igw.key === e.to) continue;
      this.draft.edges.delete(`${e.from}\u0000${e.to}`);
      for (const label of e.labels.length ? e.labels : [undefined]) {
        this.draft.edge(USERS, igw.key, label, [...e.evidence, ...igw.evidence]);
        this.draft.edge(igw.key, e.to, label, e.evidence);
      }
    }
    for (const key of this.kinds.keys()) {
      const nat = this.type(key) === "AWS::EC2::NatGateway";
      if (!nat && !COMPUTE.test(this.type(key))) continue;
      for (const s of this.subnetsOf(key)) {
        const r = this.routesOf(s);
        for (const next of nat ? r.igw : r.nat)
          for (const t of this.nodesFor(next))
            this.draft.edge(key, t, "outbound", r.evidence, { dashed: true, back: true });
      }
    }
  }
}

/** A logical id without the hash CDK appends: OrdersTable3D5F2A1B is OrdersTable. */
function bare(id: string): string {
  return id.replace(/[0-9A-F]{8}$/, "") || id;
}

function slugOf(s: string): string {
  return humanize(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function verbFor(type: string): string {
  if (/Lambda::Function|Serverless::Function/.test(type)) return "invokes";
  if (type === "AWS::SQS::Queue") return "enqueues";
  if (type === "AWS::SNS::Topic") return "publishes";
  if (/DynamoDB/.test(type)) return "writes";
  return "calls";
}

function titleOf(path: string, stack: Stack): string {
  const generic = /^(template|packaged|cdk\.out|stack|main|infra)$/i;
  const name = basename(path).replace(/\.template\.json$|\.(ya?ml|json)$/i, "");
  if (!generic.test(name)) return humanize(name);
  return generic.test(stack.name) ? "CloudFormation stack" : humanize(stack.name);
}
