import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { allIcons } from "../src/icons/index.ts";
import { layout } from "../src/layout/index.ts";
import { iconsDir } from "../src/paths.ts";
import { AWS_CATEGORY_COLORS, serviceGroupStroke } from "../src/styles.ts";
import type { Scene, ThemeName } from "../src/types.ts";
import { model, must } from "./helpers.ts";

const strokes = async (source: string, theme: ThemeName = "light") => {
  const scene: Scene = await layout(model(source), { theme });
  return Object.fromEntries(scene.groups.map((g) => [g.id, g.stroke]));
};
const labels = async (source: string) => {
  const scene: Scene = await layout(model(source), { theme: "light" });
  return Object.fromEntries(scene.groups.map((g) => [g.id, g.labelColor]));
};

const SERVICE_GROUPS = `skin: classic
groups:
  cluster: { label: Amazon EKS cluster, icon: aws:eks }
  bucket: { type: aws:generic, label: Amazon S3, icon: aws:s3 }
  flow: { type: aws:generic-dashed, label: Orders workflow, icon: aws:step-functions }
  table: { type: dashed, label: Amazon DynamoDB, icon: aws:dynamodb }
  ou: { type: generic, label: Workloads OU, icon: aws:organizations-organizational-unit }
  tier: { label: Web tier }
  users: { label: Clients, icon: aws:users }
  pinned: { label: Amazon EKS, icon: aws:eks, color: "#2563eb" }
  zone: { type: zone, label: Data, icon: aws:rds }
  vpc: { type: aws:vpc }
  k8s: { label: Cluster, icon: k8s:pod }
nodes:
  a: { icon: aws:ecs, label: Pod, in: cluster }
  b: { icon: aws:s3, label: Bucket, in: bucket }
  c: { icon: aws:lambda, label: Step, in: flow }
  d: { icon: aws:dynamodb, label: Table, in: table }
  e: { icon: aws:organizations-account, label: Account, in: ou }
  f: { icon: aws:ec2, label: Web, in: tier }
  g: { icon: aws:mobile-client, label: App, in: users }
  h: { icon: aws:ecs, label: Pod, in: pinned }
  i: { icon: aws:rds, label: DB, in: zone }
  j: { icon: aws:ec2, label: VM, in: vpc }
  k: { label: Pod, in: k8s }
`;

describe("AWS service group colors", () => {
  it("draws every AWS service and resource icon in its category's color", () => {
    const pack = JSON.parse(readFileSync(join(iconsDir, "aws.json"), "utf8")) as {
      icons: Record<string, { b: string; r?: string }>;
    };
    const aws = allIcons().filter(
      (i) => i.pack === "aws" && (i.type === "service" || i.type === "resource"),
    );
    expect(aws.length).toBeGreaterThan(700);
    for (const icon of aws) {
      const entry = must(pack.icons[icon.slug], icon.id);
      const art = entry.r ? must(pack.icons[entry.r], entry.r).b : entry.b;
      const first = /fill="(#[0-9a-f]{6})"/i.exec(art)?.[1]?.toLowerCase();
      const want = AWS_CATEGORY_COLORS[icon.category];
      if (icon.category === "General") expect(want, icon.id).toBeUndefined();
      else expect(first, `${icon.id} (${icon.category})`).toBe(want);
    }
  });

  it("matches the fills of the pack's category icons", () => {
    const pack = JSON.parse(readFileSync(join(iconsDir, "aws.json"), "utf8")) as {
      icons: Record<string, { b: string }>;
    };
    const fill = (slug: string) =>
      /fill="(#[0-9a-f]{6})"/i.exec(must(pack.icons[slug], slug).b)?.[1]?.toLowerCase();
    expect(fill("category-compute")).toBe(AWS_CATEGORY_COLORS.Compute);
    expect(fill("category-databases")).toBe(AWS_CATEGORY_COLORS.Databases);
    expect(fill("category-storage")).toBe(AWS_CATEGORY_COLORS.Storage);
    expect(fill("category-artificial-intelligence")).toBe(
      AWS_CATEGORY_COLORS["Artificial Intelligence"],
    );
    expect(fill("category-security-identity")).toBe(
      AWS_CATEGORY_COLORS["Security, Identity & Compliance"],
    );
    expect(fill("category-management-tools")).toBe(AWS_CATEGORY_COLORS["Management & Governance"]);
  });

  it("colors only neutral frames whose icon is an AWS service or resource", () => {
    expect(serviceGroupStroke("box", "aws:eks")).toBe("#ed7100");
    expect(serviceGroupStroke("aws:generic", "aws:bedrock")).toBe("#01a88d");
    expect(serviceGroupStroke("box", "aws:users")).toBeUndefined();
    expect(serviceGroupStroke("box", "aws:category-compute")).toBeUndefined();
    expect(serviceGroupStroke("box", "azure:kubernetes-services")).toBeUndefined();
    expect(serviceGroupStroke("zone", "aws:rds")).toBeUndefined();
    expect(serviceGroupStroke("aws:vpc", "aws:ec2")).toBeUndefined();
    expect(serviceGroupStroke("box", undefined)).toBeUndefined();
  });

  it("frames each service group in the classic skin in its icon's category color", async () => {
    const s = await strokes(SERVICE_GROUPS);
    expect(s).toMatchObject({
      cluster: "#ed7100",
      bucket: "#7aa116",
      flow: "#e7157b",
      table: "#c925d1",
      ou: "#e7157b",
      tier: "#888f99",
      users: "#888f99",
      pinned: "#2563eb",
      zone: "#888f99",
      vpc: "#8c4fff",
      k8s: "#888f99",
    });
  });

  it("keeps the deck's black label and lets an explicit color color the label too", async () => {
    const l = await labels(SERVICE_GROUPS);
    expect(l.cluster).toBe(l.tier);
    expect(l.bucket).toBe(l.vpc);
    expect(l.pinned).toBe("#2563eb");
  });

  it("keeps the category color in the dark theme", async () => {
    const s = await strokes(SERVICE_GROUPS, "dark");
    expect(s.cluster).toBe("#ed7100");
    expect(s.table).toBe("#c925d1");
  });

  it("leaves the stage skin's own palette alone", async () => {
    const stage = await strokes(SERVICE_GROUPS.replace("skin: classic", "skin: stage"));
    expect(stage.cluster).toBe(stage.tier);
    expect(stage.bucket).toBe(stage.tier);
  });

  it("colors an icon: false service frame grey", async () => {
    const s = await strokes(`skin: classic
groups:
  plain: { type: aws:generic, label: Amazon S3, icon: false }
nodes:
  b: { icon: aws:s3, label: Bucket, in: plain }
`);
    expect(s.plain).toBe("#7d8998");
  });
});
