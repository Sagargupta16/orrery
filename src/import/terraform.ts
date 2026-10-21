// orrery import terraform: a `terraform show -json` plan or state file to a spec, every node carrying the evidence it came from.
//
// Nodes are resources that serve traffic or hold data; boundaries come from the provider's Region,
// the account in each ARN, VPCs and subnets. Flows come only from what moves data: event source
// mappings, subscriptions, rule targets, API integrations, load balancer targets, CloudFront
// origins, IAM statements that pair a caller with a target, security group rules between groups
// and the routes out through NAT. A plan's unknown values are read from the configuration's
// references instead, through module calls and outputs. `count` and `for_each` copies become one
// node with a badge.
import { readFileSync } from "node:fs";
import { basename, dirname, extname } from "node:path";
import { accessOf, Draft, displayPath, humanize, portLabel } from "./iac.ts";
import { asList, isObj, type Obj, text } from "./source.ts";
import {
  AWS,
  awsBalancer,
  awsEngine,
  GLUE,
  type Kind,
  TF_AWS,
  TF_AZURE,
  TF_GOOGLE,
} from "./tables.ts";
import type { Imported } from "./types.ts";

interface Instance {
  address: string;
  index?: string | number;
  values: Obj;
}

interface Block {
  /** The address with every instance key removed: `module.app.aws_lambda_function.api`. */
  key: string;
  mode: string;
  type: string;
  name: string;
  module: string;
  provider: string;
  instances: Instance[];
  config?: Obj;
  scope?: Scope;
}

/** One module of the configuration: its resources, calls and outputs, for reference lookups. */
interface Scope {
  prefix: string;
  resources: Map<string, Obj>;
  calls: Record<string, Obj>;
  outputs: Record<string, Obj>;
  children: Map<string, Scope>;
  parent?: Scope;
  call?: string;
}

interface Statement {
  actions: string[];
  /** ARNs as written (resolved against the index) and block keys from the configuration. */
  arns: string[];
  refs: string[];
}

type Routes = { igw: string[]; nat: string[]; evidence: string[] };

const USERS = "users";
const INSTANCE_KEY = /\[(?:"(?:[^"\\]|\\.)*"|\d+)\]/g;
const GENERIC_NAME = /^(this|main|default|primary|self|it|all|example|resource)$/;
/** Types whose `arn` or `endpoint` is another resource's, so they own no value in the index. */
const POINTERS =
  /_(target|attachment|association|permission|mapping|subscription|integration|route|rule)$/;
const ENDPOINTS =
  /^aws_(rds|db|elasticache|opensearch|elasticsearch|redshift|docdb|neptune|memorydb)/;
const COMPUTE = new Set([
  "aws_lambda_function",
  "aws_instance",
  "aws_autoscaling_group",
  "aws_ecs_service",
  "aws_sfn_state_machine",
  "aws_apprunner_service",
  "aws_glue_job",
  "aws_eks_cluster",
]);
const SG = ["aws_security_group"];
const ROLE = ["aws_iam_role"];
const SUBNET = ["aws_subnet"];

export async function importTerraform(path: string): Promise<Imported> {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!isObj(raw)) throw new Error(`${path} is not the JSON of terraform show -json`);
  return new Terraform(raw, path).run();
}

class Terraform {
  readonly draft = new Draft();
  readonly blocks = new Map<string, Block>();
  /** ARNs, ids, URLs and host names to the blocks that own them. */
  readonly values = new Map<string, Set<string>>();
  /** Per type, names and ids to blocks, for attributes that hold a name (`function_name`). */
  readonly named = new Map<string, Map<string, string>>();
  /** Glue blocks that belong to a node: cluster instances, launch templates, task definitions. */
  readonly parts = new Map<string, Set<string>>();
  readonly kinds = new Map<string, Kind & { concept?: string }>();
  readonly root: Scope;
  readonly plan: boolean;
  readonly shown: string;
  private readonly routes = new Map<string, Routes>();
  private byAccount = false;
  private region?: string;
  private account?: string;

  readonly json: Obj;
  readonly path: string;

  constructor(json: Obj, path: string) {
    this.json = json;
    this.path = path;
    this.shown = displayPath(path);
    this.plan = isObj(json.planned_values);
    const config = isObj(json.configuration) ? json.configuration : {};
    this.root = scopeOf(isObj(config.root_module) ? config.root_module : {}, "");
    const values = this.plan ? json.planned_values : json.values;
    const rootModule = isObj(values) && isObj(values.root_module) ? values.root_module : undefined;
    if (!rootModule)
      throw new Error(
        `${path} has no resources: pass the output of terraform show -json for a plan or a state`,
      );
    this.collect(rootModule);
    this.configOnly(this.root);
  }

  /** Data sources read at apply are only in the configuration; their statements still count. */
  private configOnly(scope: Scope) {
    for (const [local, r] of scope.resources) {
      const key = `${scope.prefix}${local}`;
      if (text(r.mode) !== "data" || this.blocks.has(key)) continue;
      this.blocks.set(key, {
        key,
        mode: "data",
        type: text(r.type) ?? "",
        name: text(r.name) ?? "",
        module: scope.prefix.replace(/\.$/, ""),
        provider: "",
        instances: [],
        config: r,
        scope,
      });
    }
    for (const child of scope.children.values()) this.configOnly(child);
  }

  run(): Imported {
    this.index();
    for (const b of this.blocks.values()) this.classify(b);
    this.foldParts();
    this.awsBoundaries();
    this.otherBoundaries();
    for (const b of this.blocks.values()) this.place(b);
    this.awsFlows();
    this.googleFlows();
    this.throughGateways();
    this.outbound();
    if ([...this.kinds.keys()].some((k) => k.includes("azurerm_")))
      this.draft.warn("flows between Azure resources are not read yet; add them by hand");
    const drawn = [...this.draft.nodes.keys()].filter((k) => k !== USERS).length;
    return this.draft.write({
      title: titleOf(this.path),
      subtitle: `From a Terraform ${this.plan ? "plan" : "state"}: ${drawn} resources drawn, ${this.draft.leftOut.size} left out`,
      command: `orrery import terraform ${this.shown}`,
      legend: { dashed: "Outbound through NAT" },
    });
  }

  // ---------------------------------------------------------------- reading

  private collect(mod: Obj) {
    for (const r of asList(mod.resources)) {
      if (!isObj(r)) continue;
      const address = text(r.address) ?? "";
      const key = address.replace(INSTANCE_KEY, "");
      const type = text(r.type) ?? "";
      const mode = text(r.mode) ?? "managed";
      const marker = mode === "data" ? ".data." : `.${type}.`;
      const module = key.slice(0, Math.max(0, key.lastIndexOf(marker)));
      let block = this.blocks.get(key);
      if (!block) {
        const scope = findScope(this.root, module);
        const config = scope?.resources.get(key.slice(module ? module.length + 1 : 0));
        block = {
          key,
          mode,
          type,
          name: text(r.name) ?? "",
          module,
          provider: text(r.provider_name) ?? "",
          instances: [],
          ...(scope ? { scope } : {}),
          ...(config ? { config } : {}),
        };
        this.blocks.set(key, block);
      }
      const index = r.index;
      block.instances.push({
        address,
        ...(typeof index === "string" || typeof index === "number" ? { index } : {}),
        values: isObj(r.values) ? r.values : {},
      });
    }
    for (const child of asList(mod.child_modules)) if (isObj(child)) this.collect(child);
  }

  private index() {
    const own = [
      "arn",
      "id",
      "invoke_arn",
      "stream_arn",
      "qualified_arn",
      "url",
      "dns_name",
      "bucket_regional_domain_name",
      "bucket_domain_name",
      "api_endpoint",
      "function_url",
      "domain_name",
      "primary_endpoint_address",
      "configuration_endpoint_address",
      "reader_endpoint",
    ];
    const names = [
      "name",
      "function_name",
      "bucket",
      "cluster_identifier",
      "replication_group_id",
      "identifier",
      "id",
      "arn",
    ];
    const regions = new Map<string, number>();
    const accounts = new Map<string, number>();
    for (const b of this.blocks.values()) {
      if (b.mode !== "managed") continue;
      const typed = this.named.get(b.type) ?? new Map<string, string>();
      this.named.set(b.type, typed);
      for (const inst of b.instances) {
        const keys = POINTERS.test(b.type)
          ? ["id"]
          : ENDPOINTS.test(b.type)
            ? [...own, "endpoint"]
            : own;
        for (const k of keys) {
          const v = text(inst.values[k]);
          if (!v || v.length < 4) continue;
          this.addValue(v, b.key);
          const host = v.match(/^[a-z]+:\/\/([^/:]+)/i)?.[1];
          if (host) this.addValue(host, b.key);
        }
        for (const k of names) {
          const v = text(inst.values[k]);
          if (v && !typed.has(v)) typed.set(v, b.key);
        }
        const arn = text(inst.values.arn)?.split(":") ?? [];
        const region = text(inst.values.region) ?? arn[3];
        if (region) regions.set(region, (regions.get(region) ?? 0) + 1);
        if (arn[4]) accounts.set(arn[4], (accounts.get(arn[4]) ?? 0) + 1);
      }
    }
    this.region = this.providerRegion("aws") ?? mostOf(regions);
    this.account = mostOf(accounts);
  }

  private addValue(v: string, key: string) {
    const set = this.values.get(v) ?? new Set<string>();
    set.add(key);
    this.values.set(v, set);
  }

  /** The blocks a value names: an exact id or ARN, a name, an ARN pattern, or an ARN inside a URI. */
  resolve(value: string, types?: string[]): string[] {
    const want = (keys: Iterable<string>) =>
      [...keys].filter((k) => !types || types.includes(this.blocks.get(k)?.type ?? ""));
    const exact = want(this.values.get(value) ?? []);
    if (exact.length) return exact;
    for (const t of types ?? []) {
      const k = this.named.get(t)?.get(value);
      if (k) return [k];
    }
    if (value.startsWith("arn:")) {
      const bare = value.replace(/(\/index|\/stream)?(\/\*|:\*)$/, "");
      const glob = /[*?]/.test(bare) ? globOf(bare) : undefined;
      const hits = new Set<string>();
      for (const [v, keys] of this.values) {
        if (!v.startsWith("arn:")) continue;
        const match = glob
          ? glob.test(v)
          : bare === v || bare.startsWith(`${v}/`) || bare.startsWith(`${v}:`);
        if (match) for (const k of keys) hits.add(k);
      }
      const found = want(hits);
      if (found.length) return found;
    }
    if (!value.includes("arn:", 1)) return [];
    // An invoke URI or a definition that carries an ARN inside it: the longest ARN wins.
    let best: string[] = [];
    let length = 0;
    for (const [v, keys] of this.values) {
      if (!v.startsWith("arn:") || v.length <= length || !value.includes(v)) continue;
      const found = want(keys);
      if (found.length) {
        best = found;
        length = v.length;
      }
    }
    return best;
  }

  /** Blocks an attribute points at: by its values, and by the configuration's references. */
  targets(b: Block, path: string, types?: string[]): string[] {
    const out = new Set<string>();
    for (const inst of b.instances)
      for (const s of strings(inst.values, path))
        for (const k of this.resolve(s, types)) out.add(k);
    for (const k of refsAt(b, path)) out.add(k);
    return [...out].filter((k) => !types || types.includes(this.blocks.get(k)?.type ?? ""));
  }

  private ofType(...types: string[]): Block[] {
    return [...this.blocks.values()].filter((b) => b.mode === "managed" && types.includes(b.type));
  }

  // ---------------------------------------------------------------- nodes

  private classify(b: Block) {
    if (b.mode === "data") return this.draft.leave(b.key, "data source");
    const kind = this.kindOf(b);
    if (kind) {
      this.kinds.set(b.key, kind);
      return;
    }
    const boundary =
      /^(aws_vpc|aws_subnet|azurerm_resource_group|azurerm_virtual_network|azurerm_subnet|google_compute_network|google_compute_subnetwork)$/;
    if (boundary.test(b.type)) return;
    const glue = GLUE.find(([re]) => re.test(b.type));
    if (glue) return this.draft.leave(b.key, glue[1]);
    this.draft.leave(b.key, "no icon for this type in the import table");
    this.draft.warn(`${b.key}: ${b.type} is not in the import table, so it is not drawn`);
  }

  private kindOf(b: Block): (Kind & { concept?: string }) | undefined {
    const v = b.instances[0]?.values ?? {};
    let concept = TF_AWS[b.type];
    if (!concept) return TF_AZURE[b.type] ?? TF_GOOGLE[b.type];
    if (b.type === "aws_lb" || b.type === "aws_alb")
      concept = awsBalancer(text(v.load_balancer_type));
    if (b.type === "aws_apigatewayv2_api" && text(v.protocol_type) === "WEBSOCKET")
      concept = "websocketApi";
    if (/^aws_(elasticache_|rds_cluster$|db_instance$)/.test(b.type))
      concept = awsEngine(concept, text(v.engine));
    const kind = AWS[concept];
    return kind ? { ...kind, concept } : undefined;
  }

  /** Cluster instances, launch templates, task definitions and instance profiles join their node. */
  private foldParts() {
    const add = (part: string, node: string) => {
      const set = this.parts.get(part) ?? new Set<string>();
      set.add(node);
      this.parts.set(part, set);
    };
    for (const b of this.ofType("aws_rds_cluster_instance"))
      for (const c of this.targets(b, "cluster_identifier", ["aws_rds_cluster"])) add(b.key, c);
    for (const b of this.ofType("aws_autoscaling_group"))
      for (const path of [
        "launch_template.id",
        "launch_template.name",
        "mixed_instances_policy.launch_template.launch_template_specification.launch_template_id",
        "launch_configuration",
      ])
        for (const t of this.targets(b, path, ["aws_launch_template", "aws_launch_configuration"]))
          add(t, b.key);
    for (const b of this.ofType("aws_ecs_service"))
      for (const t of this.targets(b, "task_definition", ["aws_ecs_task_definition"]))
        add(t, b.key);
    for (const b of this.blocks.values())
      for (const path of [
        "iam_instance_profile",
        "iam_instance_profile.name",
        "iam_instance_profile.arn",
      ])
        for (const p of this.targets(b, path, ["aws_iam_instance_profile"]))
          for (const n of this.nodesFor(b.key)) add(p, n);
  }

  /** The nodes a block stands for: itself when drawn, else the nodes it is part of. */
  nodesFor(key: string): string[] {
    if (this.kinds.has(key)) return [key];
    return [...(this.parts.get(key) ?? [])].filter((k) => this.kinds.has(k));
  }

  private place(b: Block) {
    const kind = this.kinds.get(b.key);
    if (!kind) return;
    const v = b.instances[0]?.values ?? {};
    let copies = b.instances.length;
    let what = kind.what;
    if (b.type === "aws_rds_cluster") {
      let members = 0;
      for (const [part, nodes] of this.parts)
        if (nodes.has(b.key) && this.blocks.get(part)?.type === "aws_rds_cluster_instance")
          members += this.blocks.get(part)?.instances.length ?? 0;
      copies = Math.max(copies, members);
    }
    if (b.type === "aws_autoscaling_group" && typeof v.min_size === "number")
      what = `${what}, ${v.min_size} to ${v.max_size}`;
    if (b.type === "aws_cloudwatch_event_rule") what = text(v.schedule_expression) ?? what;
    const keys = keysOf(b);
    if (keys) what = `${what}: ${keys}`;
    const parent = this.parentOf(b, kind);
    // aws_lb.web and aws_autoscaling_group.web become web-alb and web-asg, not web and web-2.
    const concept = kind.concept ?? shortType(b.type);
    const twins = [...this.kinds.keys()].filter((k) => this.blocks.get(k)?.name === b.name);
    const hint = GENERIC_NAME.test(b.name)
      ? concept
      : twins.length > 1
        ? `${b.name}-${concept}`
        : b.name;
    this.draft.node(b.key, {
      icon: kind.icon,
      name: labelOf(b),
      what,
      hint,
      ...(parent ? { parent } : {}),
      copies,
      evidence: [b.key],
    });
  }

  // ---------------------------------------------------------------- boundaries

  private providerRegion(key: string | undefined): string | undefined {
    const providers = isObj(this.json.configuration)
      ? this.json.configuration.provider_config
      : undefined;
    if (!isObj(providers) || !key) return undefined;
    const p = providers[key] ?? providers[key.split(":").pop() ?? ""];
    const region = isObj(p) && isObj(p.expressions) ? p.expressions.region : undefined;
    if (!isObj(region)) return undefined;
    const constant = text(region.constant_value);
    if (constant) return constant;
    const ref = referencesIn(region).find((r) => r.startsWith("var."));
    const vars = this.json.variables;
    const variable = ref && isObj(vars) ? vars[ref.slice(4)] : undefined;
    return isObj(variable) ? text(variable.value) : undefined;
  }

  /** A block's Region: its own attribute, its ARN, its provider's, else the stack's main one. */
  private regionOf(b: Block): string | undefined {
    for (const inst of b.instances) {
      const r = text(inst.values.region) ?? text(inst.values.arn)?.split(":")[3];
      if (r) return r;
    }
    return this.providerRegion(text(b.config?.provider_config_key)) ?? this.region;
  }

  private accountOf(b: Block): string | undefined {
    for (const inst of b.instances) {
      const a = text(inst.values.arn)?.split(":")[4] ?? text(inst.values.owner_id);
      if (a) return a;
    }
    return this.account;
  }

  private providerOf(b: Block): string {
    const key = text(b.config?.provider_config_key)?.split(":").pop();
    return `provider.${key ?? b.provider.split("/").pop() ?? "aws"}`;
  }

  private awsBoundaries() {
    const aws = [...this.blocks.values()].filter(
      (b) => b.mode === "managed" && b.type.startsWith("aws_"),
    );
    const first = aws[0];
    if (!first) return;
    this.byAccount = new Set(aws.map((b) => this.accountOf(b)).filter(Boolean)).size > 1;
    this.draft.group("aws", {
      type: "aws:cloud",
      label: "AWS Cloud",
      hint: "cloud",
      evidence: [this.providerOf(first)],
    });
    for (const b of aws) {
      if (b.type !== "aws_vpc") continue;
      const cidr = text(b.instances[0]?.values.cidr_block);
      this.draft.group(b.key, {
        type: "aws:vpc",
        label: cidr ? `VPC ${cidr}` : `VPC (${labelOf(b)})`,
        parent: this.regionGroup(b),
        hint: GENERIC_NAME.test(b.name) ? "vpc" : `${b.name}-vpc`,
        evidence: [b.key],
      });
    }
    for (const b of aws) if (b.type === "aws_subnet") this.subnetGroup(b);
  }

  /** The Region group for a block, inside its account's group when there are several accounts. */
  private regionGroup(b: Block): string {
    const region = this.regionOf(b);
    const account = this.byAccount ? this.accountOf(b) : undefined;
    let parent = "aws";
    if (account)
      parent = this.draft.group(`account:${account}`, {
        type: "aws:account",
        label: `Account ${account}`,
        parent: "aws",
        hint: `account-${account}`,
        evidence: [b.key],
      });
    return this.draft.group(`region:${account ?? ""}:${region ?? ""}`, {
      type: "aws:region",
      label: region ?? "Region",
      parent,
      hint: region ?? "region",
      evidence: [region ? this.providerOf(b) : b.key],
    });
  }

  private subnetGroup(b: Block) {
    const vpc = this.targets(b, "vpc_id", ["aws_vpc"])[0];
    const zones = [
      ...new Set(b.instances.map((i) => text(i.values.availability_zone)).filter(Boolean)),
    ];
    const flag = b.instances.map((i) => i.values.map_public_ip_on_launch);
    const isPublic =
      flag.includes(true) ||
      this.routesOf(b.key).igw.length > 0 ||
      (!flag.includes(false) && /public/i.test(b.name));
    let parent = vpc ?? this.regionGroup(b);
    const many = b.instances.length > 1;
    if (!many && zones[0])
      parent = this.draft.group(`az:${vpc ?? ""}:${zones[0]}`, {
        type: "aws:az",
        label: `Availability Zone ${zones[0]}`,
        parent,
        hint: `az-${zones[0]}`,
        evidence: [b.key],
      });
    const kind = isPublic ? "Public" : "Private";
    const role = GENERIC_NAME.test(b.name)
      ? ""
      : humanize(b.name)
          .toLowerCase()
          .replace(/\b(public|private|subnets?)\b/g, " ")
          .replace(/\s+/g, " ")
          .trim();
    // Kept short: a header label wider than the gaps between the edges entering below it cannot
    // slide clear of them. The badges on the copies inside say how many zones there are.
    this.draft.group(b.key, {
      type: isPublic ? "aws:public-subnet" : "aws:private-subnet",
      label: `${kind} subnet${many ? "s" : ""}${role ? ` (${role})` : ""}`,
      parent,
      hint: GENERIC_NAME.test(b.name) ? "subnet" : `${b.name}-subnet`,
      evidence: [b.key],
    });
  }

  /** The group a node sits in: the innermost group holding all its subnets, its VPC or Region. */
  private parentOf(b: Block, kind: Kind): string | undefined {
    if (!b.type.startsWith("aws_")) return this.otherParent(b);
    if (kind.global) return "aws";
    const subnets = this.subnetsOf(b).filter((s) => this.draft.groups.has(s));
    if (subnets.length) return this.draft.commonGroup(subnets);
    const vpc = this.targets(b, "vpc_id", ["aws_vpc"])[0];
    if (vpc && this.draft.groups.has(vpc)) return vpc;
    return this.regionGroup(b);
  }

  subnetsOf(b: Block): string[] {
    const out = new Set<string>();
    for (const path of [
      "subnet_id",
      "subnet_ids",
      "subnets",
      "vpc_zone_identifier",
      "vpc_config.subnet_ids",
      "network_configuration.subnets",
      "broker_node_group_info.client_subnets",
      "vpc_options.subnet_ids",
    ])
      for (const s of this.targets(b, path, SUBNET)) out.add(s);
    for (const [path, type] of [
      ["db_subnet_group_name", "aws_db_subnet_group"],
      ["subnet_group_name", "aws_elasticache_subnet_group"],
    ] as const)
      for (const g of this.targets(b, path, [type])) {
        const group = this.blocks.get(g);
        if (group) for (const s of this.targets(group, "subnet_ids", SUBNET)) out.add(s);
      }
    for (const m of this.ofType("aws_efs_mount_target"))
      if (this.targets(m, "file_system_id").includes(b.key))
        for (const s of this.targets(m, "subnet_id", SUBNET)) out.add(s);
    return [...out];
  }

  /** Where a subnet's default route goes: an internet gateway or NAT gateways, with evidence. */
  routesOf(subnet: string): Routes {
    const known = this.routes.get(subnet);
    if (known) return known;
    const out: Routes = { igw: [], nat: [], evidence: [] };
    for (const assoc of this.ofType("aws_route_table_association")) {
      if (!this.targets(assoc, "subnet_id", SUBNET).includes(subnet)) continue;
      for (const rt of this.targets(assoc, "route_table_id", ["aws_route_table"])) {
        const table = this.blocks.get(rt);
        if (!table) continue;
        const routes: [Block, string][] = [[table, "route."]];
        for (const r of this.ofType("aws_route"))
          if (this.targets(r, "route_table_id").includes(rt)) routes.push([r, ""]);
        for (const [owner, prefix] of routes) {
          const igw = this.targets(owner, `${prefix}gateway_id`, ["aws_internet_gateway"]);
          const nat = this.targets(owner, `${prefix}nat_gateway_id`, ["aws_nat_gateway"]);
          if (igw.length || nat.length) out.evidence.push(owner.key, assoc.key);
          out.igw.push(...igw);
          out.nat.push(...nat);
        }
      }
    }
    this.routes.set(subnet, out);
    return out;
  }

  private otherBoundaries() {
    for (const b of this.ofType("azurerm_resource_group")) {
      const loc = text(b.instances[0]?.values.location);
      this.draft.group(b.key, {
        type: "azure:resource-group",
        label: `Resource group ${labelOf(b)}${loc ? ` (${loc})` : ""}`,
        hint: `${b.name}-rg`,
        evidence: [b.key],
      });
    }
    for (const b of this.ofType("azurerm_virtual_network")) {
      const rg = this.targets(b, "resource_group_name", ["azurerm_resource_group"])[0];
      this.draft.group(b.key, {
        type: "azure:vnet",
        label: `Virtual network ${labelOf(b)}`,
        ...(rg ? { parent: rg } : {}),
        hint: `${b.name}-vnet`,
        evidence: [b.key],
      });
    }
    for (const b of this.ofType("azurerm_subnet")) {
      const vnet = this.targets(b, "virtual_network_name", ["azurerm_virtual_network"])[0];
      this.draft.group(b.key, {
        type: "azure:subnet",
        label: `Subnet ${labelOf(b)}`,
        ...(vnet ? { parent: vnet } : {}),
        hint: `${b.name}-subnet`,
        evidence: [b.key],
      });
    }
    for (const b of this.blocks.values()) {
      if (b.mode !== "managed" || !b.type.startsWith("google_")) continue;
      const project = text(b.instances[0]?.values.project);
      if (project)
        this.draft.group(`project:${project}`, {
          type: "gcp:project",
          label: `Project ${project}`,
          hint: project,
          evidence: [b.key],
        });
      if (b.type === "google_compute_network")
        this.draft.group(b.key, {
          type: "gcp:vpc",
          label: `VPC ${labelOf(b)}`,
          ...(project ? { parent: `project:${project}` } : {}),
          hint: `${b.name}-vpc`,
          evidence: [b.key],
        });
    }
    for (const b of this.ofType("google_compute_subnetwork")) {
      const net = this.targets(b, "network", ["google_compute_network"])[0];
      const region = text(b.instances[0]?.values.region);
      this.draft.group(b.key, {
        type: "gcp:subnet",
        label: `Subnet ${labelOf(b)}${region ? ` (${region})` : ""}`,
        ...(net ? { parent: net } : {}),
        hint: `${b.name}-subnet`,
        evidence: [b.key],
      });
    }
  }

  private otherParent(b: Block): string | undefined {
    const firstOf = (paths: string[], types: string[]) => {
      for (const p of paths) {
        const hit = this.targets(b, p, types)[0];
        if (hit) return hit;
      }
      return undefined;
    };
    if (b.type.startsWith("azurerm_")) {
      const subnet = firstOf(
        [
          "subnet_id",
          "virtual_network_subnet_id",
          "default_node_pool.vnet_subnet_id",
          "delegated_subnet_id",
        ],
        ["azurerm_subnet"],
      );
      if (subnet) return subnet;
      for (const nic of this.targets(b, "network_interface_ids", ["azurerm_network_interface"])) {
        const block = this.blocks.get(nic);
        const s = block && this.targets(block, "ip_configuration.subnet_id", ["azurerm_subnet"])[0];
        if (s) return s;
      }
      return this.targets(b, "resource_group_name", ["azurerm_resource_group"])[0];
    }
    if (!b.type.startsWith("google_")) return undefined;
    const net =
      firstOf(
        [
          "network_interface.subnetwork",
          "subnetwork",
          "template.vpc_access.network_interfaces.subnetwork",
        ],
        ["google_compute_subnetwork"],
      ) ??
      firstOf(
        [
          "network",
          "network_interface.network",
          "settings.ip_configuration.private_network",
          "authorized_network",
        ],
        ["google_compute_network"],
      );
    if (net) return net;
    const v = b.instances[0]?.values ?? {};
    const project = text(v.project);
    if (!project) return undefined;
    const region = text(v.region) ?? text(v.location)?.match(/^[a-z]+-[a-z]+\d+$/)?.[0];
    if (!region) return `project:${project}`;
    return this.draft.group(`region:${project}:${region}`, {
      type: "gcp:region",
      label: `Region ${region}`,
      parent: `project:${project}`,
      hint: region,
      evidence: [b.key],
    });
  }

  // ---------------------------------------------------------------- flows

  /** A flow between two blocks, drawn between the nodes each stands for. */
  private flow(
    from: string,
    to: string,
    label: string | undefined,
    evidence: string[],
    dashed = false,
  ) {
    for (const f of this.nodesFor(from))
      for (const t of this.nodesFor(to))
        this.draft.edge(f, t, label, evidence, { dashed, back: dashed });
  }

  /** Users on the internet reach an entry point: an API, a distribution, a public balancer. */
  private fromUsers(to: string, label: string, evidence: string[]) {
    if (!this.kinds.has(to)) return;
    const users = AWS.users;
    if (!users) return;
    this.draft.node(USERS, { icon: users.icon, name: "Users", what: "", hint: "users", evidence });
    this.draft.edge(USERS, to, label, evidence);
  }

  private awsFlows() {
    const lambda = ["aws_lambda_function"];
    for (const m of this.ofType("aws_lambda_event_source_mapping"))
      for (const src of this.targets(m, "event_source_arn"))
        for (const fn of this.targets(m, "function_name", lambda))
          this.flow(src, fn, "polls", [m.key]);

    for (const s of this.ofType("aws_sns_topic_subscription")) {
      const targets = this.targets(s, "endpoint");
      for (const topic of this.targets(s, "topic_arn", ["aws_sns_topic"]))
        for (const target of targets) this.flow(topic, target, "delivers", [s.key]);
      const protocol = text(s.instances[0]?.values.protocol) ?? "an outside";
      if (!targets.length)
        this.draft.leftOut.set(s.key, `${protocol} subscriber outside the stack`);
    }

    for (const t of this.ofType("aws_cloudwatch_event_target"))
      for (const rule of this.targets(t, "rule", ["aws_cloudwatch_event_rule"]))
        for (const target of this.targets(t, "arn")) this.flow(rule, target, "triggers", [t.key]);
    for (const r of this.ofType("aws_cloudwatch_event_rule"))
      for (const bus of this.targets(r, "event_bus_name", ["aws_cloudwatch_event_bus"]))
        this.flow(bus, r.key, "matches", [r.key]);
    for (const s of this.ofType("aws_scheduler_schedule"))
      for (const target of this.targets(s, "target.arn"))
        this.flow(s.key, target, "triggers", [s.key]);

    this.apiFlows();
    this.balancerFlows();

    for (const d of this.ofType("aws_cloudfront_distribution")) {
      this.fromUsers(d.key, "HTTPS", [d.key]);
      for (const origin of this.targets(d, "origin.domain_name"))
        this.flow(d.key, origin, "origin", [d.key]);
    }
    for (const u of this.ofType("aws_lambda_function_url"))
      for (const fn of this.targets(u, "function_name", lambda))
        this.fromUsers(fn, "HTTPS", [u.key]);

    for (const n of this.ofType("aws_s3_bucket_notification"))
      for (const bucket of this.targets(n, "bucket", ["aws_s3_bucket"]))
        for (const path of [
          "lambda_function.lambda_function_arn",
          "queue.queue_arn",
          "topic.topic_arn",
        ])
          for (const target of this.targets(n, path))
            this.flow(bucket, target, "object events", [n.key]);

    this.queueFlows();

    for (const sm of this.ofType("aws_sfn_state_machine")) {
      const found = new Set(refsAt(sm, "definition"));
      for (const inst of sm.instances)
        for (const arn of text(inst.values.definition)?.match(/arn:[^"\s]+/g) ?? [])
          for (const k of this.resolve(arn)) found.add(k);
      for (const t of found) this.flow(sm.key, t, verbFor(this.blocks.get(t)?.type), [sm.key]);
    }
    for (const f of this.ofType("aws_kinesis_firehose_delivery_stream")) {
      for (const src of this.targets(f, "kinesis_source_configuration.kinesis_stream_arn"))
        this.flow(src, f.key, "polls", [f.key]);
      for (const path of ["extended_s3_configuration.bucket_arn", "s3_configuration.bucket_arn"])
        for (const b of this.targets(f, path, ["aws_s3_bucket"]))
          this.flow(f.key, b, "delivers", [f.key]);
    }
    for (const p of this.ofType("aws_pipes_pipe"))
      for (const src of this.targets(p, "source"))
        for (const target of this.targets(p, "target")) this.flow(src, target, "pipe", [p.key]);

    this.iamFlows();
    this.securityGroupFlows();
  }

  /** HTTP and REST APIs: every integration is a flow, labelled with the routes that use it. */
  private apiFlows() {
    const routes = this.ofType("aws_apigatewayv2_route");
    for (const i of this.ofType("aws_apigatewayv2_integration")) {
      const ids = i.instances.map((x) => text(x.values.id)).filter(Boolean);
      const mine = routes.filter(
        (r) =>
          r.instances.some((x) =>
            ids.some((id) => text(x.values.target) === `integrations/${id}`),
          ) || refsAt(r, "target").includes(i.key),
      );
      const keys = mine.flatMap((r) => r.instances.map((x) => text(x.values.route_key)));
      const label = keys.filter(Boolean).join(", ") || undefined;
      for (const api of this.targets(i, "api_id", ["aws_apigatewayv2_api"]))
        for (const target of this.targets(i, "integration_uri"))
          this.flow(api, target, label, [i.key, ...mine.map((r) => r.key)]);
    }
    for (const i of this.ofType("aws_api_gateway_integration")) {
      const method = text(i.instances[0]?.values.http_method);
      const resource = this.targets(i, "resource_id", ["aws_api_gateway_resource"])[0];
      const path = resource
        ? text(this.blocks.get(resource)?.instances[0]?.values.path)
        : undefined;
      const label = [method, path].filter(Boolean).join(" ") || undefined;
      for (const api of this.targets(i, "rest_api_id", ["aws_api_gateway_rest_api"]))
        for (const target of this.targets(i, "uri")) this.flow(api, target, label, [i.key]);
    }
    for (const api of this.ofType("aws_apigatewayv2_api", "aws_api_gateway_rest_api"))
      this.fromUsers(api.key, "HTTPS", [api.key]);
  }

  /** Load balancers: listener, then target group, then what the group sends traffic to. */
  private balancerFlows() {
    const tgTypes = ["aws_lb_target_group", "aws_alb_target_group"];
    const behind = (tg: string): string[] => {
      const out = new Set<string>();
      for (const b of this.ofType("aws_autoscaling_group"))
        if (this.targets(b, "target_group_arns").includes(tg)) out.add(b.key);
      for (const b of this.ofType("aws_ecs_service"))
        if (this.targets(b, "load_balancer.target_group_arn").includes(tg)) out.add(b.key);
      for (const b of this.ofType("aws_autoscaling_attachment"))
        if (this.targets(b, "lb_target_group_arn").includes(tg))
          for (const a of this.targets(b, "autoscaling_group_name", ["aws_autoscaling_group"]))
            out.add(a);
      for (const b of this.ofType(
        "aws_lb_target_group_attachment",
        "aws_alb_target_group_attachment",
      ))
        if (this.targets(b, "target_group_arn").includes(tg))
          for (const t of this.targets(b, "target_id")) out.add(t);
      return [...out];
    };
    const rules = this.ofType("aws_lb_listener_rule", "aws_alb_listener_rule");
    for (const l of this.ofType("aws_lb_listener", "aws_alb_listener")) {
      const lbs = this.targets(l, "load_balancer_arn", ["aws_lb", "aws_alb"]);
      const tgs = new Set([
        ...this.targets(l, "default_action.target_group_arn", tgTypes),
        ...this.targets(l, "default_action.forward.target_group.arn", tgTypes),
      ]);
      for (const r of rules)
        if (this.targets(r, "listener_arn").includes(l.key))
          for (const t of this.targets(r, "action.target_group_arn", tgTypes)) tgs.add(t);
      for (const tg of tgs) {
        const v = this.blocks.get(tg)?.instances[0]?.values ?? {};
        const label =
          typeof v.port === "number" ? portLabel(v.port, v.port, text(v.protocol)) : undefined;
        for (const lb of lbs)
          for (const target of behind(tg)) this.flow(lb, target, label, [l.key, tg]);
      }
      const lv = l.instances[0]?.values ?? {};
      const port = typeof lv.port === "number" ? lv.port : 443;
      for (const lb of lbs)
        if (this.blocks.get(lb)?.instances[0]?.values.internal === false)
          this.fromUsers(lb, portLabel(port, port, text(lv.protocol)), [lb, l.key]);
    }
  }

  /** Queues hand failed messages to their dead-letter queue. */
  private queueFlows() {
    const dlqOf = (b: Block, attr: string): string[] => {
      const arns = b.instances
        .map((i) => parseJson(i.values[attr]))
        .map((p) => (isObj(p) ? text(p.deadLetterTargetArn) : undefined))
        .filter(isText);
      const found = arns.flatMap((a) => this.resolve(a, ["aws_sqs_queue"]));
      return found.length ? found : refsAt(b, attr).filter((k) => k.includes("aws_sqs_queue."));
    };
    for (const q of this.ofType("aws_sqs_queue"))
      for (const t of dlqOf(q, "redrive_policy")) this.flow(q.key, t, "dead letters", [q.key]);
    for (const r of this.ofType("aws_sqs_queue_redrive_policy"))
      for (const q of this.targets(r, "queue_url", ["aws_sqs_queue"]))
        for (const t of dlqOf(r, "redrive_policy"))
          if (t !== q) this.flow(q, t, "dead letters", [r.key]);
  }

  private googleFlows() {
    for (const b of this.ofType("google_pubsub_subscription"))
      for (const topic of this.targets(b, "topic", ["google_pubsub_topic"])) {
        const endpoint = b.instances.flatMap((i) =>
          strings(i.values, "push_config.push_endpoint"),
        )[0];
        const host = endpoint?.match(/^https?:\/\/([^/]+)/)?.[1];
        const targets = host ? this.resolve(host) : refsAt(b, "push_config.push_endpoint");
        for (const t of targets) this.flow(topic, t, "pushes", [b.key]);
      }
    for (const b of this.ofType(
      "google_cloudfunctions2_function",
      "google_cloudfunctions_function",
    ))
      for (const path of ["event_trigger.pubsub_topic", "event_trigger.resource"])
        for (const topic of this.targets(b, path, ["google_pubsub_topic"]))
          this.flow(topic, b.key, "triggers", [b.key]);
  }

  /** IAM: who uses each role, and what each of its policy statements lets them do. */
  private iamFlows() {
    const callers = new Map<string, Set<string>>();
    const use = (role: string, node: string) => {
      const set = callers.get(role) ?? new Set<string>();
      set.add(node);
      callers.set(role, set);
    };
    for (const b of this.blocks.values()) {
      if (b.mode !== "managed") continue;
      const nodes = this.nodesFor(b.key).filter((n) => COMPUTE.has(this.blocks.get(n)?.type ?? ""));
      // An ECS task's own role is task_role_arn; its execution role only pulls images and logs.
      const paths =
        b.type === "aws_ecs_task_definition"
          ? ["task_role_arn"]
          : ["role", "role_arn", "instance_configuration.instance_role_arn"];
      for (const n of nodes)
        for (const p of paths) for (const r of this.targets(b, p, ROLE)) use(r, n);
    }
    for (const p of this.ofType("aws_iam_instance_profile"))
      for (const r of this.targets(p, "role", ROLE))
        for (const n of this.nodesFor(p.key)) use(r, n);

    const policies = new Map<string, string[]>();
    const attach = (role: string, policy: string) =>
      policies.set(role, [...(policies.get(role) ?? []), policy]);
    for (const b of this.ofType("aws_iam_role")) {
      attach(b.key, b.key);
      for (const p of this.targets(b, "managed_policy_arns", ["aws_iam_policy"])) attach(b.key, p);
    }
    for (const b of this.ofType("aws_iam_role_policy"))
      for (const r of this.targets(b, "role", ROLE)) attach(r, b.key);
    for (const b of this.ofType("aws_iam_role_policy_attachment", "aws_iam_policy_attachment"))
      for (const r of [...this.targets(b, "role", ROLE), ...this.targets(b, "roles", ROLE)])
        for (const p of this.targets(b, "policy_arn", ["aws_iam_policy"])) attach(r, p);

    for (const [role, users] of callers)
      for (const policy of policies.get(role) ?? []) {
        const block = this.blocks.get(policy);
        if (!block) continue;
        for (const st of this.statementsOf(block)) {
          const targets = new Set(st.refs);
          for (const a of st.arns) if (a !== "*") for (const k of this.resolve(a)) targets.add(k);
          for (const action of st.actions)
            for (const access of accessOf(action))
              for (const t of targets)
                for (const target of this.nodesFor(t))
                  for (const u of users) {
                    if (target === u) continue;
                    const evidence = [`${policy} (${action})`];
                    if (access.pull) this.draft.edge(target, u, access.verb, evidence);
                    else this.draft.edge(u, target, access.verb, evidence);
                  }
        }
      }
  }

  /** Allow statements of a policy, from its JSON when known, else from the configuration. */
  private statementsOf(b: Block): Statement[] {
    const out: Statement[] = [];
    const docs: unknown[] = [];
    for (const inst of b.instances) {
      if (b.type === "aws_iam_role") {
        for (const p of asList(inst.values.inline_policy))
          if (isObj(p)) docs.push(parseJson(p.policy));
      } else docs.push(parseJson(inst.values.policy));
    }
    for (const doc of docs) out.push(...allowed(doc));
    if (out.length || b.type === "aws_iam_role") return out;
    // Unknown until apply: follow the policy's references to a policy document data source.
    for (const ref of refsAt(b, "policy")) {
      const doc = this.blocks.get(ref);
      if (doc?.type !== "aws_iam_policy_document") continue;
      const known = doc.instances.map((i) => parseJson(i.values.json)).find(isObj);
      if (known) {
        out.push(...allowed(known));
        continue;
      }
      const exprs = isObj(doc.config?.expressions) ? doc.config.expressions : {};
      for (const s of asList(exprs.statement)) {
        if (!isObj(s)) continue;
        const effect = isObj(s.effect) ? text(s.effect.constant_value) : undefined;
        if (effect && effect !== "Allow") continue;
        out.push({
          actions: isObj(s.actions)
            ? asList(s.actions.constant_value).map(text).filter(isText)
            : [],
          arns: isObj(s.resources)
            ? asList(s.resources.constant_value).map(text).filter(isText)
            : [],
          refs: doc.scope ? refsOf(doc.scope, referencesIn(s.resources)) : [],
        });
      }
    }
    if (!out.length && refsAt(b, "policy").length)
      this.draft.warn(
        `${b.key}: its policy is unknown until apply, so its flows are not drawn; import a state, or write the policy as an aws_iam_policy_document data source`,
      );
    return out;
  }

  private securityGroupFlows() {
    const members = new Map<string, Set<string>>();
    for (const b of this.blocks.values()) {
      const nodes = b.mode === "managed" ? this.nodesFor(b.key) : [];
      if (!nodes.length) continue;
      for (const path of [
        "vpc_security_group_ids",
        "security_groups",
        "security_group_ids",
        "vpc_config.security_group_ids",
        "network_configuration.security_groups",
        "network_interfaces.security_groups",
        "vpc_options.security_group_ids",
        "broker_node_group_info.security_groups",
      ])
        for (const g of this.targets(b, path, SG)) {
          const set = members.get(g) ?? new Set<string>();
          for (const n of nodes) set.add(n);
          members.set(g, set);
        }
    }
    const allow = (
      target: string,
      sources: string[],
      world: boolean,
      label: string,
      evidence: string[],
    ) => {
      for (const t of members.get(target) ?? []) {
        if (world) this.fromUsers(t, label, evidence);
        for (const s of sources)
          for (const f of members.get(s) ?? []) if (f !== t) this.draft.edge(f, t, label, evidence);
      }
    };
    const open = (cidrs: unknown[]) => cidrs.some((c) => c === "0.0.0.0/0" || c === "::/0");
    const ports = (v: Obj, proto = "protocol") => {
      const from = typeof v.from_port === "number" ? v.from_port : 0;
      const to = typeof v.to_port === "number" ? v.to_port : from;
      return portLabel(from, to, text(v[proto]));
    };
    for (const b of this.ofType("aws_security_group")) {
      const exprs = isObj(b.config?.expressions) ? b.config.expressions : {};
      const configured = asList(exprs.ingress);
      for (const inst of b.instances)
        asList(inst.values.ingress).forEach((r, i) => {
          if (!isObj(r)) return;
          const sources = asList(r.security_groups)
            .map(text)
            .filter(isText)
            .flatMap((s) => this.resolve(s, SG));
          const fromConfig = configured[i];
          if (isObj(fromConfig) && b.scope)
            sources.push(...refsOf(b.scope, referencesIn(fromConfig.security_groups)));
          if (r.self === true) sources.push(b.key);
          const label = ports(r);
          const cidrs = [...asList(r.cidr_blocks), ...asList(r.ipv6_cidr_blocks)];
          allow(b.key, sources, open(cidrs), label, [`${b.key} (ingress ${label})`]);
        });
    }
    for (const b of this.ofType("aws_security_group_rule")) {
      const v = b.instances[0]?.values ?? {};
      if (text(v.type) !== "ingress") continue;
      const cidrs = [...asList(v.cidr_blocks), ...asList(v.ipv6_cidr_blocks)];
      const sources = this.targets(b, "source_security_group_id", SG);
      for (const target of this.targets(b, "security_group_id", SG))
        allow(target, sources, open(cidrs), ports(v), [b.key]);
    }
    for (const b of this.ofType("aws_vpc_security_group_ingress_rule")) {
      const v = b.instances[0]?.values ?? {};
      const sources = this.targets(b, "referenced_security_group_id", SG);
      for (const target of this.targets(b, "security_group_id", SG))
        allow(target, sources, open([v.cidr_ipv4, v.cidr_ipv6]), ports(v, "ip_protocol"), [b.key]);
    }
  }

  /** Traffic from the internet into a VPC enters through its internet gateway. */
  private throughGateways() {
    const igws = [...this.draft.nodes.values()].filter(
      (n) => this.blocks.get(n.key)?.type === "aws_internet_gateway",
    );
    for (const e of [...this.draft.edges.values()]) {
      if (e.from !== USERS) continue;
      const vpc = this.draft
        .ancestors(this.draft.nodes.get(e.to)?.parent)
        .find((g) => this.draft.groups.get(g)?.type === "aws:vpc");
      const igw = vpc && igws.find((n) => this.draft.ancestors(n.parent).includes(vpc));
      if (!igw || igw.key === e.to) continue;
      this.draft.edges.delete(`${e.from}\u0000${e.to}`);
      const evidence = [...e.evidence, igw.key];
      for (const label of e.labels.length ? e.labels : [undefined]) {
        this.draft.edge(USERS, igw.key, label, evidence);
        this.draft.edge(igw.key, e.to, label, evidence);
      }
    }
  }

  /** Compute in a subnet whose default route goes to a NAT gateway reaches out through it. */
  private outbound() {
    for (const b of this.blocks.values()) {
      if (!this.kinds.has(b.key)) continue;
      const nat = b.type === "aws_nat_gateway";
      if (!nat && !COMPUTE.has(b.type)) continue;
      for (const s of this.subnetsOf(b)) {
        const r = this.routesOf(s);
        for (const next of nat ? r.igw : r.nat)
          this.flow(b.key, next, "outbound", r.evidence, true);
      }
    }
  }
}

// ------------------------------------------------------------------ configuration references

function scopeOf(mod: Obj, prefix: string, parent?: Scope, call?: string): Scope {
  const scope: Scope = {
    prefix,
    resources: new Map(),
    calls: isObj(mod.module_calls) ? (mod.module_calls as Record<string, Obj>) : {},
    outputs: isObj(mod.outputs) ? (mod.outputs as Record<string, Obj>) : {},
    children: new Map(),
    ...(parent ? { parent } : {}),
    ...(call ? { call } : {}),
  };
  for (const r of asList(mod.resources)) {
    const address = isObj(r) ? text(r.address) : undefined;
    if (address && isObj(r)) scope.resources.set(address, r);
  }
  for (const [name, c] of Object.entries(scope.calls))
    if (isObj(c) && isObj(c.module))
      scope.children.set(name, scopeOf(c.module, `${prefix}module.${name}.`, scope, name));
  return scope;
}

function findScope(root: Scope, module: string): Scope | undefined {
  let scope: Scope | undefined = root;
  const names = module.split(".").filter((_, i) => i % 2 === 1);
  for (const name of names) scope = scope?.children.get(name);
  return scope;
}

/** Block keys a list of references names, through `var.` inputs and `module.` outputs. */
function refsOf(scope: Scope, refs: string[], depth = 0): string[] {
  if (depth > 8) return [];
  const out = new Set<string>();
  for (const ref of refs) {
    const [head = "", second = "", third] = ref.replace(INSTANCE_KEY, "").split(".");
    if (head === "var" && scope.parent && scope.call) {
      const call = scope.parent.calls[scope.call];
      const expr = isObj(call) && isObj(call.expressions) ? call.expressions[second] : undefined;
      for (const k of refsOf(scope.parent, referencesIn(expr), depth + 1)) out.add(k);
    } else if (head === "module" && third) {
      const child = scope.children.get(second);
      const output = child?.outputs[third];
      if (child && isObj(output))
        for (const k of refsOf(child, referencesIn(output.expression), depth + 1)) out.add(k);
    } else if (head === "data" && third) out.add(`${scope.prefix}data.${second}.${third}`);
    else if (second && !/^(var|local|each|count|path|terraform|self|module)$/.test(head))
      out.add(`${scope.prefix}${head}.${second}`);
  }
  return [...out];
}

function referencesIn(expr: unknown): string[] {
  return isObj(expr) ? asList(expr.references).map(text).filter(isText) : [];
}

/** The configuration's references at a dotted attribute path, as block keys. */
function refsAt(b: Block, path: string): string[] {
  if (!b.scope || !isObj(b.config?.expressions)) return [];
  let level: unknown[] = [b.config.expressions];
  for (const step of path.split("."))
    level = level.flatMap((x) => asList(isObj(x) ? x[step] : undefined)).flat();
  return refsOf(b.scope, level.flatMap(referencesIn));
}

// ------------------------------------------------------------------ values

function isText(v: string | undefined): v is string {
  return typeof v === "string" && v.length > 0;
}

/** Every string at a dotted path, through nested blocks and lists. */
function strings(v: unknown, path: string): string[] {
  let level: unknown[] = [v];
  for (const step of path.split("."))
    level = level.flat().map((x) => (isObj(x) ? x[step] : undefined));
  return level.flat().map(text).filter(isText);
}

function parseJson(v: unknown): unknown {
  if (typeof v !== "string" || !v.trim().startsWith("{")) return undefined;
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
}

/** The Allow statements of a policy document. */
function allowed(doc: unknown): Statement[] {
  return asList(isObj(doc) ? doc.Statement : undefined)
    .filter(isObj)
    .filter((s) => (text(s.Effect) ?? "Allow") === "Allow")
    .map((s) => ({
      actions: asList(s.Action).map(text).filter(isText),
      arns: asList(s.Resource).map(text).filter(isText),
      refs: [],
    }));
}

function globOf(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
}

function mostOf(counts: Map<string, number>): string | undefined {
  let best: string | undefined;
  for (const [k, n] of counts) if (!best || n > (counts.get(best) ?? 0)) best = k;
  return best;
}

function shortType(type: string): string {
  return type.replace(/^[a-z]+_/, "");
}

function verbFor(type: string | undefined): string {
  if (type === "aws_lambda_function") return "invokes";
  if (type === "aws_sqs_queue") return "enqueues";
  if (type === "aws_sns_topic") return "publishes";
  if (type === "aws_sfn_state_machine") return "starts";
  return "calls";
}

/** A block's name: its Name tag, a name attribute, else the block name; copies lose their key. */
function labelOf(b: Block): string {
  const first = b.instances[0];
  const v = first?.values ?? {};
  const tags = isObj(v.tags) ? v.tags : {};
  const name =
    text(tags.Name) ??
    ["name", "function_name", "bucket", "cluster_identifier", "replication_group_id", "identifier"]
      .map((k) => text(v[k]))
      .find(Boolean);
  const block = humanize(GENERIC_NAME.test(b.name) ? shortType(b.type) : b.name);
  if (!name) return block;
  if (b.instances.length < 2 || first?.index === undefined) return name;
  // for_each keys name each copy (orders, emails): the block's own name names the set.
  if (typeof first.index === "string") return block;
  const index = String(first.index);
  return name.replace(new RegExp(`[-_ .]?${index}$`), "") || name;
}

/** The keys of for_each copies, for the note: "orders, emails". */
function keysOf(b: Block): string | undefined {
  const keys = b.instances.map((i) => i.index).filter((k) => typeof k === "string");
  if (keys.length < 2) return undefined;
  return keys.length > 3 ? `${keys.slice(0, 3).join(", ")} +${keys.length - 3}` : keys.join(", ");
}

function titleOf(path: string): string {
  const generic = /^(plan|tfplan|state|terraform|show|main|default|out|infra)$/i;
  let name = basename(path, extname(path)).replace(/\.(tfstate|tfplan|plan|state)$/i, "");
  if (generic.test(name)) name = basename(dirname(path));
  return !name || name === "." || generic.test(name) ? "Terraform infrastructure" : humanize(name);
}
