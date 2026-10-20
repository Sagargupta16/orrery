// The conventions dimension: which rubrics apply, legend and title, the AWS naming, boundary and
// service rules, step callouts, C4 notation, brand marks, Google Cloud icons, and notation checks.
import { aliases, iconInfo, resolveIcon } from "../icons/index.ts";
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
  const { shorts, longAws } = awsNames(c);
  const boundaries = awsBoundaryLabels(c);
  const serviceGroups = awsServiceGroups(c);
  const serviceLabels = awsServiceLabels(c);
  const callouts = calloutSizes(c);
  const { c4Elements, c4Relations } = c4Notation(c, c4);
  const recolored = recoloredMarks(c);
  const gcpWrong = gcpProductIcons(c);

  Object.assign(m, {
    vendors: vendors.join(",") || "none",
    title: model.title ? "yes" : "no",
    legendMissing: missing,
    shortNames: shorts,
    longAwsLabels: longAws,
    boundaryLabels: boundaries,
    serviceGroups,
    serviceLabels,
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
 * AWS-17 (aws-archify composition.md): a boundary group says which boundary it is. Measured: the
 * label does not name it at all ("Web subnet" on a private subnet); whether the name leads, with
 * context after it in parentheses, is the reviewer's call.
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
      { group: g.id, type: g.type, label: g.label, expected: want.name },
      `group "${g.id}" draws the ${g.type} boundary but its label "${g.label}" does not say ${want.name}`,
      [`set label: ${label} on "${g.id}"`],
      3,
      [{ op: "set", path: `groups.${g.id}.label`, value: label }],
    );
  }
  return boundaries;
}

/**
 * AWS-18 (aws-archify composition.md): a group with a service's icon in its corner is that one
 * service and holds only its parts. Measured on an icon: override; the presets (Step Functions
 * workflow, EC2 instance contents) hold other services by the deck's own design.
 */
function awsServiceGroups(c: Ctx): number {
  const { model, add } = c;
  let serviceGroups = 0;
  for (const g of model.groups) {
    const own = typeof g.icon === "string" ? iconInfo(g.icon) : undefined;
    if (own?.pack !== "aws" || own.type !== "service") continue;
    const others = model.nodes.filter((n) => {
      const info = n.parent === g.id && n.icon ? iconInfo(n.icon) : undefined;
      return info?.pack === "aws" && info.category !== "General" && !info.name.startsWith(own.name);
    });
    if (!others.length) continue;
    serviceGroups++;
    const names = [...new Set(others.map((n) => iconInfo(n.icon ?? "")?.name ?? n.id))];
    add(
      "conventions.service-group",
      "minor",
      [g.id, ...others.map((n) => n.id)],
      { group: g.id, service: own.name, others: names.join(", ") },
      `group "${g.id}" carries the ${own.name} icon but holds ${names.join(", ")}`,
      [
        `drop icon: from "${g.id}" and use type: aws:generic for a tier of different services`,
        `keep only ${own.name} and its own parts in "${g.id}"`,
      ],
      4,
      [{ op: "unset", path: `groups.${g.id}.icon` }],
    );
  }
  return serviceGroups;
}

/**
 * AWS-19 (aws-archify composition.md): a service icon's label is the official name and the role
 * goes in note, so every tile reads as a real service. Measured: the label names the service in no
 * form (full name, the name without Amazon or AWS, initials, catalog alias). A node inside a frame of
 * its own service is one of that service's parts (pods in an EKS cluster) and takes a part name.
 */
function awsServiceLabels(c: Ctx): number {
  const { model, add } = c;
  let serviceLabels = 0;
  for (const n of model.nodes) {
    const info = n.icon ? iconInfo(n.icon) : undefined;
    if (info?.pack !== "aws" || info.type !== "service" || !/^(Amazon|AWS) /.test(info.name))
      continue;
    const forms = [info.name, ...shortFormsOf(info)];
    // A label that opens with Amazon or AWS is meant as a service name (the catalog shortens some:
    // "Amazon FSx for WFS"); AWS-08 and the reviewer judge whether it is the right one.
    if (/^(Amazon|AWS)\s/.test(n.label) || forms.some((f) => hasPhrase(norm(n.label), f))) continue;
    let part = false;
    for (let p = n.parent; p && !part; p = c.parentOf(p)) {
      const g = model.groups.find((x) => x.id === p);
      const gi = typeof g?.icon === "string" ? iconInfo(g.icon) : undefined;
      part =
        !!gi?.name &&
        (gi.id === info.id || info.name.startsWith(gi.name) || gi.name.startsWith(info.name));
      part ||= !!g && forms.some((f) => hasPhrase(norm(g.label), f));
    }
    if (part) continue;
    serviceLabels++;
    const rest = (n.note ?? "")
      .replace(new RegExp(escapeRe(info.name), "i"), "")
      .replace(/^[\s,;:-]+|[\s,;:-]+$/g, "");
    const note = rest ? `${n.label}, ${rest}` : n.label;
    add(
      "conventions.service-label",
      "minor",
      [n.id],
      { label: n.label, service: info.name, note: n.note ?? "" },
      `"${n.id}" is drawn with the ${info.name} icon but its label "${n.label}" does not name the service`,
      [`set label: ${info.name} and note: ${note} on "${n.id}"`],
      2,
      [
        { op: "set", path: `nodes.${n.id}.label`, value: info.name },
        { op: "set", path: `nodes.${n.id}.note`, value: note },
      ],
    );
  }
  return serviceLabels;
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
