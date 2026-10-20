// The conventions dimension: which rubrics apply, legend and title, the AWS naming, boundary and
// service rules, step callouts, C4 notation, brand marks, Google Cloud icons, and notation checks.
import { aliases, type IconInfo, iconInfo, resolveIcon } from "../icons/index.ts";
import type { ModelGroup } from "../types.ts";
import { r1, real } from "./geometry.ts";
import { edgeName, escapeRe, hasPhrase, norm } from "./names.ts";
import { NOTATION_CHECKS, NOTATIONS } from "./notations.ts";
import type { Ctx } from "./types.ts";

let shortForms: Map<string, string[]> | undefined;

/** Alias slugs per canonical icon id ("aws:dms" for the Database Migration Service). */
function aliasesFor(id: string): string[] {
  if (!shortForms) {
    shortForms = new Map();
    for (const alias of Object.keys(aliases())) {
      const target = resolveIcon(alias);
      if (!target) continue;
      const slug = alias.split(":")[1]?.replace(/-/g, " ") ?? "";
      shortForms.set(target, [...(shortForms.get(target) ?? []), slug]);
    }
  }
  return shortForms.get(id) ?? [];
}

/** What an AWS service goes by besides its full name: without Amazon or AWS, initials, aliases. */
function shortFormsOf(info: { id: string; name: string }): string[] {
  const core = info.name.replace(/^(Amazon|AWS)\s+/, "");
  const acronym = core
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w))
    .map((w) => w[0])
    .join("");
  return [core, acronym.length >= 2 ? acronym : "", ...aliasesFor(info.id)];
}

/** AWS boundary groups and the functional name their label carries (AWS-17). */
const BOUNDARY_NAMES: Record<string, { name: string; test: RegExp }> = {
  "aws:cloud": { name: "AWS Cloud", test: /\baws cloud\b/ },
  "aws:cloud-alt": { name: "AWS Cloud", test: /\baws cloud\b/ },
  "aws:account": { name: "Account", test: /\baccounts?\b/ },
  // A Region code names the Region itself.
  "aws:region": { name: "Region", test: /\bregion\b|\b[a-z]{2}(-gov)?-[a-z]+-\d\b/ },
  "aws:az": { name: "Availability Zone", test: /\b(availability zone|az)\b/ },
  "aws:vpc": { name: "VPC", test: /\b(vpc|virtual private cloud)\b/ },
  "aws:public-subnet": { name: "Public subnet", test: /\bpublic subnets?\b/ },
  "aws:private-subnet": { name: "Private subnet", test: /\bprivate subnets?\b/ },
  "aws:auto-scaling": { name: "Auto Scaling group", test: /\bauto scaling\b/ },
  "aws:corporate-dc": { name: "Corporate data center", test: /\bdata cent(er|re)\b/ },
};

const C4_TYPE =
  /\[(person|software system|external (software )?system|system|container|component|database|queue)\b([^\]]*)\]/i;

export function measureConventions(c: Ctx): { vendors: string[]; rubrics: string[] } {
  const { model } = c;
  const m = c.metrics.conventions;
  const { c4, notation, vendors, rubrics } = rubricsFor(c);

  const missing = legendAndTitle(c, c4);
  const subtitle = subtitleEcho(c);
  const { shorts, longAws } = awsNames(c);
  const boundaries = awsBoundaryLabels(c) + vendorBoundaryLabels(c);
  const groupsOfOne = serviceGroups(c);
  const named = serviceLabels(c);
  const callouts = calloutSizes(c);
  const { c4Elements, c4Relations } = c4Notation(c, c4);
  const recolored = recoloredMarks(c);
  const gcpWrong = gcpProductIcons(c);

  Object.assign(m, {
    vendors: vendors.join(",") || "none",
    title: model.title ? "yes" : "no",
    subtitle,
    legendMissing: missing,
    shortNames: shorts,
    longAwsLabels: longAws,
    boundaryLabels: boundaries,
    serviceGroups: groupsOfOne,
    serviceLabels: named,
    calloutSizes: callouts,
    c4Elements,
    c4Relations,
    recolored,
    gcpIconMismatches: gcpWrong,
    ...(notation ? { notation, ...NOTATION_CHECKS[model.kind]?.(c) } : {}),
  });
  return { vendors, rubrics };
}

/** Icon packs, C4 and the diagram kind's notation in use, and the rubric files they pick. */
function rubricsFor(c: Ctx): {
  c4: boolean;
  notation: string | undefined;
  vendors: string[];
  rubrics: string[];
} {
  const { model } = c;
  const packs = new Set<string>();
  for (const n of model.nodes) {
    const info = n.icon ? iconInfo(n.icon) : undefined;
    if (info) packs.add(info.pack);
  }
  for (const g of model.groups) {
    const prefix = g.type.split(":")[0];
    if (g.type.includes(":") && prefix) packs.add(prefix);
  }
  const c4 =
    model.groups.some((g) => g.type.startsWith("c4:")) ||
    /\bC4\b/.test(`${model.title ?? ""} ${model.subtitle ?? ""}`);
  // The diagram kind picks a notation rubric too; vendor rubrics still apply to vendor icons.
  const notation = NOTATIONS[model.kind];
  const vendors = [
    ...["aws", "azure", "gcp", "k8s"].filter((p) => packs.has(p)),
    ...(c4 ? ["c4"] : []),
    ...(notation ? [notation] : []),
  ];
  const rubrics = vendors.filter((v) => v !== "k8s").map((v) => `conventions-${v}.md`);
  return { c4, notation, vendors, rubrics };
}

/**
 * Legend for line styles (Azure Well-Architected, C4 notation). A BPMN message flow is dashed
 * and an association dotted by the notation itself, which explains them. Returns how many drawn
 * styles the legend misses.
 */
function legendAndTitle(c: Ctx, c4: boolean): number {
  const { model, add } = c;
  const styled = model.edges.filter(
    (e) =>
      !(e.flow === "message" && e.line === "dashed") &&
      !(e.flow === "association" && e.line === "dotted"),
  );
  const used = [...new Set(styled.map((e) => e.line))].filter((l) => l !== "solid");
  const keyed = new Set((model.legend ?? []).map((l) => l.line));
  const missing = used.filter((l) => !keyed.has(l));
  if (missing.length || (c4 && !model.legend?.length)) {
    const styles = missing.length ? missing : ["solid"];
    add(
      "conventions.legend-missing",
      "major",
      styled.filter((e) => styles.includes(e.line)).map((e) => e.id),
      {
        styles: styles.join(","),
        edges: styled.filter((e) => styles.includes(e.line)).length,
      },
      `${styles.join(" and ")} line(s) are drawn but no legend says what they mean`,
      [`add legend: { ${styles.map((l) => `${l}: <what it means>`).join(", ")} }`],
      15 * styles.length,
    );
  }
  const unusedKey = (model.legend ?? []).filter((l) => !model.edges.some((e) => e.line === l.line));
  if (unusedKey.length)
    add(
      "conventions.legend-unused",
      "minor",
      [],
      { styles: unusedKey.map((l) => l.line).join(",") },
      `the legend explains ${unusedKey.map((l) => l.line).join(", ")} but no edge uses it`,
      [`remove ${unusedKey.map((l) => l.line).join(", ")} from legend:`],
      3 * unusedKey.length,
    );
  if (!model.title)
    add(
      "conventions.title-missing",
      "minor",
      [],
      { title: "none" },
      "the diagram has no title, so readers do not know its scope",
      ["add title: <system and scope>, for example title: Orders API on AWS"],
      8,
    );
  return missing.length;
}

/** Words that join the items of a list and say nothing themselves. */
const JOINERS = new Set(["a", "an", "and", "or", "plus", "the", "then", "to", "via", "with"]);

/**
 * A subtitle that adds something: no subtitle that repeats the title or lists the nodes.
 * Measured: every subtitle word but the joiners is a title word, or the subtitle is node and group
 * labels strung together (two with nothing else, four or more with at most one other word). A
 * sentence about the system says what the picture alone cannot.
 */
function subtitleEcho(c: Ctx): string {
  const { model, add } = c;
  if (!model.subtitle) return "none";
  const stem = (w: string) => w.replace(/s$/, "");
  const words = (s: string) =>
    norm(s)
      .split(" ")
      .filter((w) => w && !JOINERS.has(w))
      .map(stem);
  const title = new Set(words(model.title ?? ""));
  const sub = words(model.subtitle);
  let echo: "title" | "labels" | undefined;
  if (title.size && sub.length && sub.every((w) => title.has(w))) echo = "title";
  const parts = [...model.nodes, ...model.groups]
    .flatMap((x) => [
      x.label,
      x.label.replace(/^(Amazon|AWS|Azure|Google Cloud|Microsoft)\s+/i, ""),
    ])
    .map((l) => words(l).join(" "))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  let rest = ` ${sub.join(" ")} `;
  const listed = new Set<string>();
  for (const p of parts)
    if (rest.includes(` ${p} `)) {
      listed.add(p);
      rest = rest.split(` ${p} `).join(" | ");
    }
  const left = rest.split(/[\s|]+/).filter(Boolean).length;
  if (!echo && ((listed.size >= 2 && !left) || (listed.size >= 4 && left <= 1))) echo = "labels";
  if (!echo) return "ok";
  add(
    "conventions.subtitle-echo",
    "minor",
    [],
    {
      subtitle: model.subtitle,
      echoes: echo,
      ...(echo === "labels" ? { labels: listed.size } : {}),
    },
    echo === "title"
      ? `the subtitle "${model.subtitle}" only repeats the title`
      : `the subtitle "${model.subtitle}" only lists ${listed.size} labels the diagram already shows`,
    [
      "say in the subtitle what the picture alone does not: the scope, the main path, what changes",
      "drop the subtitle",
    ],
    4,
  );
  return echo;
}

/** AWS names (deck slide 17): short forms only after the full name appears somewhere. */
function awsNames(c: Ctx): { shorts: number; longAws: number } {
  const { model, add } = c;
  const allText = norm(
    [
      model.title,
      model.subtitle,
      ...model.nodes.flatMap((n) => [n.label, n.note]),
      ...model.groups.map((g) => g.label),
      ...model.edges.map((e) => e.label),
      ...(model.legend ?? []).map((l) => l.label),
    ]
      .filter(Boolean)
      .join(" | "),
  );
  let shorts = 0;
  let longAws = 0;
  for (const n of model.nodes) {
    const info = n.icon ? iconInfo(n.icon) : undefined;
    // Resource icons carry resource names ("NAT gateway"), as the deck's own examples do.
    if (info?.pack !== "aws" || info.type !== "service" || !/^(Amazon|AWS) /.test(info.name))
      continue;
    const full = info.name;
    const label = norm(`${n.label} ${n.note ?? ""}`);
    if (!hasPhrase(allText, full)) {
      const form = shortFormsOf(info).find((f) => hasPhrase(label, f));
      if (form) {
        shorts++;
        // Name where it was found: a short form only in the note is not the label's.
        const where = hasPhrase(norm(n.label), form) ? `"${n.label}"` : `the note of "${n.label}"`;
        add(
          "conventions.short-name",
          "minor",
          [n.id],
          { label: n.label, shortForm: form, fullName: full },
          `${where} uses the short form "${form}" but "${full}" appears nowhere in the diagram`,
          [`set label: ${full} on one "${info.id}" node, or note: ${full}`],
          4,
        );
      }
    }
    const sn = c.nodes.get(n.id);
    if (sn && sn.label.lines.length > 2) {
      longAws++;
      add(
        "conventions.label-lines",
        "minor",
        [n.id],
        { lines: sn.label.lines.length },
        `the AWS label of "${n.id}" runs over ${sn.label.lines.length} lines (the deck allows two)`,
        ["shorten the label and move the rest into note"],
        3,
      );
    }
  }
  return { shorts, longAws };
}

/**
 * AWS-17: a boundary group says which boundary it is. Measured: the label does not name it at all
 * ("Web subnet" on a private subnet); whether the name leads, with context after it in
 * parentheses, is the reviewer's call.
 */
function awsBoundaryLabels(c: Ctx): number {
  const { model, add } = c;
  let boundaries = 0;
  for (const g of model.groups) {
    const want = BOUNDARY_NAMES[g.type];
    if (!want || !g.label || want.test.test(g.label.toLowerCase())) continue;
    boundaries++;
    const words = new Set(want.name.toLowerCase().split(/\s+/));
    const rest = g.label
      .split(/\s+/)
      .filter((w) => !words.has(w.toLowerCase()))
      .join(" ")
      .trim();
    const label = rest ? `${want.name} (${rest})` : want.name;
    add(
      "conventions.boundary-label",
      "minor",
      [g.id],
      { group: g.id, type: g.type, label: g.label, expected: want.name, rule: "AWS-17" },
      `group "${g.id}" draws the ${g.type} boundary but its label "${g.label}" does not say ${want.name}`,
      [`set label: ${label} on "${g.id}"`],
      3,
      [{ op: "set", path: `groups.${g.id}.label`, value: label }],
      "AWS-17",
    );
  }
  return boundaries;
}

/** The rubric rule each vendor's form of a naming finding restates: FLOW-12 where none has one. */
const VENDOR_RULES = {
  boundary: { azure: "AZ-12", gcp: "GCP-06", k8s: "FLOW-12" },
  serviceGroup: { aws: "AWS-18", azure: "FLOW-12", gcp: "FLOW-12" },
  serviceLabel: { aws: "AWS-19", azure: "AZ-07", gcp: "GCP-04" },
} as const;

interface BoundaryFamily {
  pack: keyof typeof VENDOR_RULES.boundary;
  family: string;
  /** A label that only names the family ("Subnet", "VNet"), normalized. */
  generic: RegExp;
  example: string;
}

/** Azure, Google Cloud and Kubernetes boundary groups, by family (a hub VNet is a VNet). */
const BOUNDARY_FAMILIES: Record<string, BoundaryFamily> = {
  "azure:subscription": {
    pack: "azure",
    family: "subscription",
    generic: /^(azure )?subscriptions?$/,
    example: "Production subscription",
  },
  "azure:resource-group": {
    pack: "azure",
    family: "resource group",
    generic: /^(resource groups?|rg)$/,
    example: "rg-web-prod",
  },
  "azure:vnet": {
    pack: "azure",
    family: "virtual network",
    generic: /^(hub )?(virtual networks?|vnets?)$/,
    example: "vnet-spoke-app",
  },
  "azure:vnet-hub": {
    pack: "azure",
    family: "virtual network",
    generic: /^(hub )?(virtual networks?|vnets?)$/,
    example: "vnet-hub",
  },
  "azure:subnet": { pack: "azure", family: "subnet", generic: /^subnets?$/, example: "snet-web" },
  "gcp:project": {
    pack: "gcp",
    family: "project",
    generic: /^projects?$/,
    example: "Project shop-prod",
  },
  "gcp:region": { pack: "gcp", family: "region", generic: /^regions?$/, example: "us-central1" },
  "gcp:zone": { pack: "gcp", family: "zone", generic: /^zones?$/, example: "us-central1-a" },
  "gcp:vpc": {
    pack: "gcp",
    family: "VPC network",
    generic: /^(vpc|vpc networks?|networks?)$/,
    example: "VPC network shared",
  },
  "gcp:subnet": { pack: "gcp", family: "subnet", generic: /^subnets?$/, example: "Subnet web" },
  "k8s:cluster": {
    pack: "k8s",
    family: "cluster",
    generic: /^(kubernetes )?clusters?$/,
    example: "Production cluster",
  },
  "k8s:namespace": {
    pack: "k8s",
    family: "namespace",
    generic: /^namespaces?$/,
    example: "Namespace shop",
  },
};

/**
 * AWS-17 for the other vendors: when a diagram has several boundaries of one family (two VNets,
 * three subnets, two namespaces), each label says what that one is for. Their frames and corner
 * icons already say the type, so the vendors' own naming (vnet-hub, snet-web, Project shop-prod)
 * passes; measured is a label that only repeats the type ("Subnet") or one a sibling of the same
 * family already carries. One of a kind needs no name.
 */
function vendorBoundaryLabels(c: Ctx): number {
  const { model, add } = c;
  let boundaries = 0;
  const families = new Map<string, ModelGroup[]>();
  for (const g of model.groups) {
    const f = BOUNDARY_FAMILIES[g.type];
    if (f)
      families.set(`${f.pack}:${f.family}`, [...(families.get(`${f.pack}:${f.family}`) ?? []), g]);
  }
  for (const members of families.values()) {
    if (members.length < 2) continue;
    for (const [i, g] of members.entries()) {
      const f = BOUNDARY_FAMILIES[g.type];
      if (!f) continue;
      const label = norm(g.label);
      const bare = !label || f.generic.test(label);
      const twin = bare
        ? undefined
        : members.slice(0, i).find((o) => o.parent === g.parent && norm(o.label) === label);
      if (!bare && !twin) continue;
      boundaries++;
      const rule = VENDOR_RULES.boundary[f.pack];
      add(
        "conventions.boundary-label",
        "minor",
        twin ? [twin.id, g.id] : [g.id],
        {
          group: g.id,
          type: g.type,
          label: g.label,
          sameType: members.length,
          ...(twin ? { twin: twin.id } : {}),
          rule,
        },
        twin
          ? `groups "${twin.id}" and "${g.id}" are both ${f.family}s labelled "${g.label}" in one parent, so readers cannot tell them apart`
          : `group "${g.id}" is one of ${members.length} ${f.family}s but its label "${g.label}" only names the ${f.family}, not what it is for`,
        [`set label: on "${g.id}" to say what it holds, for example ${f.example}`],
        3,
        undefined,
        rule,
      );
    }
  }
  return boundaries;
}

/** Icons that stand for no product (people, files, category marks): they take any label. */
const genericIcon = (info: IconInfo) =>
  info.type !== "service" ||
  info.category === "General" ||
  (info.pack === "azure" && /^(Users|Groups)$/.test(info.name));

/** One service and its parts: a name that extends the other's (SQL Database in SQL). */
const sameService = (a: IconInfo, b: IconInfo) =>
  a.id === b.id || a.name.startsWith(b.name) || b.name.startsWith(a.name);

/**
 * AWS-18: a group with a service's icon in its corner is that one service and holds only its
 * parts; Azure and Google Cloud frames work the same way (FLOW-12: one service's own frame).
 * Measured on an icon: override; the presets (Step Functions workflow, EC2 instance contents, a
 * GKE cluster) hold other services by the vendors' own design.
 */
function serviceGroups(c: Ctx): number {
  const { model, add } = c;
  let count = 0;
  for (const g of model.groups) {
    const own = typeof g.icon === "string" ? iconInfo(g.icon) : undefined;
    if (own?.type !== "service" || !(own.pack in VENDOR_RULES.serviceGroup)) continue;
    const aws = own.pack === "aws";
    const others = model.nodes.filter((n) => {
      const info = n.parent === g.id && n.icon ? iconInfo(n.icon) : undefined;
      if (info?.pack !== own.pack) return false;
      return aws
        ? info.category !== "General" && !info.name.startsWith(own.name)
        : !genericIcon(info) && !sameService(info, own);
    });
    if (!others.length) continue;
    count++;
    const rule = VENDOR_RULES.serviceGroup[own.pack as keyof typeof VENDOR_RULES.serviceGroup];
    const names = [...new Set(others.map((n) => iconInfo(n.icon ?? "")?.name ?? n.id))];
    add(
      "conventions.service-group",
      "minor",
      [g.id, ...others.map((n) => n.id)],
      { group: g.id, service: own.name, others: names.join(", "), rule },
      `group "${g.id}" carries the ${own.name} icon but holds ${names.join(", ")}`,
      [
        aws
          ? `drop icon: from "${g.id}" and use type: aws:generic for a tier of different services`
          : `drop icon: from "${g.id}" so it reads as a tier of different services`,
        `keep only ${own.name} and its own parts in "${g.id}"`,
      ],
      4,
      [{ op: "unset", path: `groups.${g.id}.icon` }],
      rule,
    );
  }
  return count;
}

/** Trailing catalog words that only say "an instance of it": the rest is the product's name. */
const INSTANCE_WORD =
  /^(services?|accounts?|sets?|profiles?|environments?|workspaces?|instances?)$/i;
/** Trailing nouns too general to name a product alone. */
const PLAIN_WORD =
  /^(services?|accounts?|sets?|apps?|profiles?|environments?|workspaces?|instances?|resources?|groups?|servers?|databases?|machines?|storage|networks?)$/i;

const singular = (w: string) => w.replace(/ies$/, "y").replace(/([^s])s$/, "$1");

/**
 * What an Azure or Google Cloud service goes by besides its catalog name ("Key Vaults"): the
 * singular, the name without Azure, Microsoft, Google or Cloud when what is left still names it,
 * the name without a trailing instance word ("Log Analytics" for Log Analytics Workspaces), its
 * own trailing noun ("gateway" for an ExpressRoute gateway on Virtual Network Gateways), catalog
 * aliases (azure:aks) and initials.
 */
function vendorFormsOf(info: IconInfo): string[] {
  const words = info.name.split(/\s+/);
  const last = words.at(-1) ?? "";
  const one = [...words.slice(0, -1), singular(last)].join(" ");
  const bare = (s: string) => {
    const rest = s.replace(/^(Azure|Microsoft|Google Cloud|Google|Cloud)\s+/, "");
    return rest !== s && (rest.includes(" ") || rest.length >= 5) ? rest : "";
  };
  const head = words.length > 1 && INSTANCE_WORD.test(last) ? words.slice(0, -1).join(" ") : "";
  const tail = words.length > 1 && !PLAIN_WORD.test(last) && last.length >= 4 ? last : "";
  const acronym = words
    .filter((w) => /^[A-Z]/.test(w))
    .map((w) => w[0])
    .join("");
  return [
    info.name,
    one,
    bare(info.name),
    bare(one),
    head.includes(" ") || head.length >= 5 ? head : "",
    tail,
    tail && singular(tail),
    acronym.length >= 2 ? acronym : "",
    ...aliasesFor(info.id),
  ].filter(Boolean);
}

/**
 * A node inside a frame of its own service is one of that service's parts (pods in an EKS cluster)
 * and takes a part name: the frame carries the service's icon or names it.
 */
function partOfFrame(c: Ctx, parent: string | undefined, info: IconInfo, forms: string[]): boolean {
  for (let p = parent; p; p = c.parentOf(p)) {
    const g = c.model.groups.find((x) => x.id === p);
    const gi = typeof g?.icon === "string" ? iconInfo(g.icon) : undefined;
    if (
      gi?.name &&
      (gi.id === info.id || info.name.startsWith(gi.name) || gi.name.startsWith(info.name))
    )
      return true;
    if (g && forms.some((f) => hasPhrase(norm(g.label), f))) return true;
  }
  return false;
}

/**
 * AWS-19: a service icon's label is the official name and the role goes in note, so every tile
 * reads as a real service. Measured: the label names the service in no form (full name, the name
 * without Amazon or AWS, initials, catalog alias). Azure asks for the product name close to the
 * icon, in the label or the note (AZ-07), and Google Cloud for the names its guide lists (GCP-04),
 * so there either may carry it, in any form vendorFormsOf knows. Resource, category and general
 * icons (people, files) take any label, as do a service's parts in its frame;
 * outside AWS, a product the title or subtitle names frames the whole diagram, so its tiles may
 * carry component names (Model Registry on a Vertex AI MLOps diagram).
 */
function serviceLabels(c: Ctx): number {
  const { model, add } = c;
  let count = 0;
  const about = norm(`${model.title ?? ""} ${model.subtitle ?? ""}`);
  for (const n of model.nodes) {
    const info = n.icon ? iconInfo(n.icon) : undefined;
    if (!info || !(info.pack in VENDOR_RULES.serviceLabel)) continue;
    const aws = info.pack === "aws";
    if (aws ? info.type !== "service" || !/^(Amazon|AWS) /.test(info.name) : genericIcon(info))
      continue;
    const forms = aws ? [info.name, ...shortFormsOf(info)] : vendorFormsOf(info);
    const text = norm(aws ? n.label : `${n.label} ${n.note ?? ""}`);
    // A label that opens with Amazon or AWS is meant as a service name (the catalog shortens some:
    // "Amazon FSx for WFS"); AWS-08 and the reviewer judge whether it is the right one.
    if ((aws && /^(Amazon|AWS)\s/.test(n.label)) || forms.some((f) => hasPhrase(text, f))) continue;
    if (partOfFrame(c, n.parent, info, forms) || (!aws && forms.some((f) => hasPhrase(about, f))))
      continue;
    count++;
    const rule = VENDOR_RULES.serviceLabel[info.pack as keyof typeof VENDOR_RULES.serviceLabel];
    // Outside AWS the catalog name is plural ("Key Vaults"); the product is one of them.
    const product = aws
      ? info.name
      : info.pack === "azure"
        ? (vendorFormsOf(info)[1] ?? info.name)
        : info.name;
    const rest = (n.note ?? "")
      .replace(new RegExp(escapeRe(info.name), "i"), "")
      .replace(/^[\s,;:-]+|[\s,;:-]+$/g, "");
    const note = aws
      ? rest
        ? `${n.label}, ${rest}`
        : n.label
      : rest
        ? `${product}, ${rest}`
        : product;
    add(
      "conventions.service-label",
      "minor",
      [n.id],
      { label: n.label, service: info.name, note: n.note ?? "", rule },
      aws
        ? `"${n.id}" is drawn with the ${info.name} icon but its label "${n.label}" does not name the service`
        : `"${n.id}" is drawn with the ${info.name} icon but neither its label "${n.label}" nor its note names the product`,
      [
        aws
          ? `set label: ${info.name} and note: ${note} on "${n.id}"`
          : `set note: ${note} on "${n.id}", or put ${product} in its label`,
      ],
      2,
      aws
        ? [
            { op: "set", path: `nodes.${n.id}.label`, value: info.name },
            { op: "set", path: `nodes.${n.id}.note`, value: note },
          ]
        : [{ op: "set", path: `nodes.${n.id}.note`, value: note }],
      rule,
    );
  }
  return count;
}

/** Callouts in one size (deck slide 18). Returns how many sizes there are. */
function calloutSizes(c: Ctx): number {
  const { scene, add } = c;
  const callouts = new Set(
    scene.edges.filter((e) => real(e.stepBox)).map((e) => `${r1(e.stepBox?.w ?? 0)}`),
  );
  if (callouts.size > 1)
    add(
      "conventions.callout-sizes",
      "minor",
      [],
      { sizes: [...callouts].join(",") },
      `step callouts come in ${callouts.size} sizes (${[...callouts].join(", ")}px)`,
      ["report it: callout size is set by the renderer, not the spec"],
      5,
    );
  return callouts.size;
}

/** C4 notation: element type, description and technology; labelled relationships. */
function c4Notation(c: Ctx, c4: boolean): { c4Elements: number; c4Relations: number } {
  const { model, add } = c;
  let c4Elements = 0;
  let c4Relations = 0;
  if (c4) {
    for (const n of model.nodes) {
      const text = `${n.label} ${n.note ?? ""}`;
      const tag = text.match(C4_TYPE);
      const lacks: string[] = [];
      if (!tag) lacks.push("type");
      const kind = tag?.[1]?.toLowerCase() ?? "";
      if ((kind === "container" || kind === "component") && !/:\s*\S/.test(tag?.[3] ?? ""))
        lacks.push("technology");
      const desc = (n.note ?? "").replace(/\[[^\]]*\]/g, "").trim();
      if (!desc) lacks.push("description");
      if (lacks.length) {
        c4Elements++;
        add(
          "conventions.c4-element",
          "minor",
          [n.id],
          { lacks: lacks.join(",") },
          `C4 element "${n.id}" has no ${lacks.join(", ")}`,
          [`set note: "[Container: <technology>] <what it does>" (or [Person], [Software System])`],
          4,
        );
      }
    }
    for (const e of model.edges) {
      const label = e.label ?? "";
      const words = label.replace(/\[[^\]]*\]/g, "").trim();
      const lacks: string[] = [];
      if (!label) lacks.push("label");
      else {
        if (!/\[[^\]]+\]/.test(label)) lacks.push("technology");
        if (!/\s/.test(words)) lacks.push("specific intent");
      }
      if (lacks.length) {
        c4Relations++;
        add(
          "conventions.c4-relationship",
          "minor",
          [e.id],
          { edge: edgeName(e), label, lacks: lacks.join(",") },
          `C4 relationship ${edgeName(e)} has no ${lacks.join(", ")}`,
          [`label it with the intent and protocol, for example "Reads orders from [SQL]"`],
          3,
        );
      }
    }
  }
  return { c4Elements, c4Relations };
}

/** Brand marks keep their color (Azure Well-Architected; GitHub brand guidance). */
function recoloredMarks(c: Ctx): number {
  const { model, add } = c;
  let recolored = 0;
  for (const n of model.nodes) {
    const info = n.icon ? iconInfo(n.icon) : undefined;
    if (!n.color || !info || n.look !== "icon" || !["si", "github"].includes(info.pack)) continue;
    recolored++;
    add(
      "conventions.icon-recolored",
      "minor",
      [n.id],
      { icon: info.id, color: n.color },
      `"${n.id}" recolors the ${info.name} mark to ${n.color}`,
      [`remove color: from "${n.id}"`],
      5,
    );
  }
  return recolored;
}

/** Google Cloud: a product drawn with its own icon or its category icon (May 2026 guide). */
function gcpProductIcons(c: Ctx): number {
  const { model, add } = c;
  let gcpWrong = 0;
  for (const n of model.nodes) {
    const info = n.icon ? iconInfo(n.icon) : undefined;
    if (info?.pack !== "gcp") continue;
    const slug = n.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    // "Pub/Sub" is gcp:pubsub: try the slug with and without its dashes.
    const product = iconInfo(`gcp:${slug}`) ?? iconInfo(`gcp:${slug.replace(/-/g, "")}`);
    if (!product || product.type === "category" || product.id === info.id) continue;
    if (norm(product.name) !== norm(n.label)) continue;
    const ok =
      info.name === product.name ||
      (product.category !== "Core products" && info.name === `${product.category} category`);
    if (ok) continue;
    gcpWrong++;
    add(
      "conventions.gcp-product-icon",
      "major",
      [n.id],
      { label: n.label, icon: info.id, expected: product.id },
      `"${n.label}" is drawn with ${info.id}; Google assigns it ${product.id}`,
      [`set icon: ${product.id} on "${n.id}"`],
      8,
    );
  }
  return gcpWrong;
}
