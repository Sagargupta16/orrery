// Group (container) styles, each with its source. AWS values are read from the official
// Architecture Icons deck; Google Cloud and Azure publish no container spec, so their values are
// measured from the vendors' own reference diagrams (skills/stackdraw/references/styles.md).

export interface GroupStyle {
  key: string;
  label: string;
  stroke: string;
  /** Fill for the light theme; the dark theme tints the stroke instead. */
  fill?: string;
  /** Dash pattern in px, e.g. "6.67 5". */
  dash?: string;
  /** Hex, or "ink" for the theme's text color (the AWS deck labels groups in black or white). */
  labelColor?: string;
  icon?: string;
  /**
   * "tile": square icon flush in the top-left corner (AWS). "tile-center": the tile at the top
   * center with the label under it (AWS Auto Scaling group). "inline": small icon before the label.
   */
  iconStyle: "tile" | "tile-center" | "inline";
  labelAlign: "left" | "center";
  strokeWidth: number;
  rounded: number;
  description: string;
  /** Where the values come from; "inferred" marks a judgement call. */
  source: string;
  /** A frame: the fill shows as a band and the content sits on this inner panel color. */
  innerFill?: string;
}

type StyleSpec = Omit<GroupStyle, "key" | "iconStyle" | "strokeWidth" | "rounded" | "labelAlign"> &
  Partial<Pick<GroupStyle, "iconStyle" | "strokeWidth" | "rounded" | "labelAlign">>;
type Partial2 = Omit<StyleSpec, "source"> & { source?: string };

const AWS_DECK = "AWS Architecture Icons deck 2026-07-31, Groups slide";
// AWS: 1.25pt borders (1.67px), no fills, black/white labels, dash 6.67 5, Region short-dash 5 1.67.
const aws = (s: Partial2): StyleSpec => ({
  iconStyle: "tile",
  rounded: 0,
  strokeWidth: 1.67,
  labelColor: "ink",
  source: AWS_DECK,
  ...s,
});
const AWS_DASH = "6.67 5";

const GCP_SVG = "Google Cloud Architecture Center diagrams (2025 deployment archetypes), measured";
const gcp = (s: Partial2): StyleSpec => ({
  iconStyle: "inline",
  rounded: 6,
  strokeWidth: 2,
  labelColor: "#202124",
  source: GCP_SVG,
  ...s,
});

const AZURE_SVG =
  "Azure Architecture Center diagrams (baseline App Service, hub-spoke, AKS baseline), measured";
const azure = (s: Partial2): StyleSpec => ({
  iconStyle: "inline",
  rounded: 0,
  strokeWidth: 1,
  labelColor: "#000000",
  source: AZURE_SVG,
  ...s,
});

const K8S_DECK = "kubernetes/community icon deck";
const STACKDRAW = "stackdraw";
const C4 = "C4-PlantUML v2.14.0 boundary style";

const DEFS: Record<string, StyleSpec> = {
  // ------------------------------------------------------------- AWS
  "aws:cloud": aws({
    label: "AWS Cloud",
    stroke: "#232f3e",
    icon: "aws:group-aws-cloud-logo",
    description: "The AWS Cloud boundary, with the AWS logo tile.",
  }),
  "aws:cloud-alt": aws({
    label: "AWS Cloud",
    stroke: "#232f3e",
    icon: "aws:group-aws-cloud",
    description: "AWS Cloud boundary with the cloud tile instead of the logo.",
  }),
  "aws:account": aws({
    label: "AWS account",
    stroke: "#e7157b",
    icon: "aws:group-aws-account",
    description: "An AWS account.",
  }),
  "aws:region": aws({
    label: "Region",
    stroke: "#00a4a6",
    dash: "5 1.67",
    icon: "aws:group-region",
    description: "An AWS Region (teal, short dashes).",
  }),
  "aws:az": aws({
    label: "Availability Zone",
    stroke: "#00a4a6",
    dash: AWS_DASH,
    labelAlign: "center",
    description: "An Availability Zone (dashed teal, centered label, no icon).",
  }),
  "aws:vpc": aws({
    label: "VPC",
    stroke: "#8c4fff",
    icon: "aws:group-virtual-private-cloud-vpc",
    description: "A virtual private cloud (purple).",
  }),
  "aws:public-subnet": aws({
    label: "Public subnet",
    stroke: "#7aa116",
    icon: "aws:group-public-subnet",
    description: "A public subnet (green).",
  }),
  "aws:private-subnet": aws({
    label: "Private subnet",
    stroke: "#00a4a6",
    icon: "aws:group-private-subnet",
    description: "A private subnet (teal).",
  }),
  "aws:security-group": aws({
    label: "Security group",
    stroke: "#dd344c",
    labelAlign: "center",
    description: "A security group (red, centered label, no icon).",
  }),
  "aws:auto-scaling": aws({
    label: "Auto Scaling group",
    stroke: "#ed7100",
    dash: AWS_DASH,
    icon: "aws:group-auto-scaling-group",
    iconStyle: "tile-center",
    labelAlign: "center",
    description:
      "An Auto Scaling group (dashed orange, icon top center). Use around: to span zones.",
  }),
  "aws:corporate-dc": aws({
    label: "Corporate data center",
    stroke: "#7d8998",
    icon: "aws:group-corporate-data-center",
    description: "An on-premises corporate data center.",
  }),
  "aws:server-contents": aws({
    label: "Server contents",
    stroke: "#7d8998",
    icon: "aws:group-server-contents",
    description: "What runs on a server.",
  }),
  "aws:ec2-contents": aws({
    label: "EC2 instance contents",
    stroke: "#ed7100",
    icon: "aws:group-ec2-instance-contents",
    description: "What runs on an EC2 instance.",
  }),
  "aws:spot-fleet": aws({
    label: "Spot Fleet",
    stroke: "#ed7100",
    icon: "aws:group-spot-fleet",
    description: "An EC2 Spot Fleet.",
  }),
  "aws:iot-greengrass": aws({
    label: "AWS IoT Greengrass Deployment",
    stroke: "#7aa116",
    icon: "aws:group-aws-iot-greengrass-deployment",
    description: "An AWS IoT Greengrass deployment.",
  }),
  "aws:step-functions": aws({
    label: "AWS Step Functions workflow",
    stroke: "#e7157b",
    icon: "aws:step-functions",
    description: "A Step Functions state machine (pink).",
  }),
  "aws:elastic-beanstalk": aws({
    label: "Elastic Beanstalk container",
    stroke: "#ed7100",
    icon: "aws:elastic-beanstalk",
    description: "An Elastic Beanstalk environment.",
  }),
  "aws:generic": aws({
    label: "",
    stroke: "#7d8998",
    labelAlign: "center",
    description: "A generic AWS group (grey, centered label).",
  }),
  "aws:generic-dashed": aws({
    label: "",
    stroke: "#7d8998",
    dash: AWS_DASH,
    labelAlign: "center",
    description: "A generic AWS group, dashed.",
  }),

  // ------------------------------------------------------------- Google Cloud
  "gcp:cloud": gcp({
    label: "Google Cloud",
    stroke: "#1f2124",
    fill: "#4285f4",
    innerFill: "#ffffff",
    labelColor: "#ffffff",
    description: "The Google Cloud frame (Google blue band, white label, white inner panel).",
  }),
  "gcp:region": gcp({
    label: "Region",
    stroke: "#1f2124",
    fill: "#e8eaed",
    description: "A Google Cloud region (grey panel).",
  }),
  "gcp:zone": gcp({
    label: "Zone",
    stroke: "#1f2124",
    dash: "4 4",
    fill: "#ffffff",
    description: "A zone (dashed, white). Google's diagrams often tag zones on cards instead.",
    source: `${GCP_SVG}; zone container inferred`,
  }),
  "gcp:vpc": gcp({
    label: "VPC network",
    stroke: "#1f2124",
    dash: "8 8",
    icon: "gcp:virtual-private-cloud",
    description: "A VPC network (dashed).",
  }),
  "gcp:subnet": gcp({
    label: "Subnet",
    stroke: "#1f2124",
    dash: "4 4",
    strokeWidth: 1.5,
    description: "A subnet (short dashes).",
  }),
  "gcp:project": gcp({
    label: "Project",
    stroke: "#1f2124",
    fill: "#f1f3f4",
    description: "A Google Cloud project (light grey).",
  }),
  "gcp:tier": gcp({
    label: "",
    stroke: "#1f2124",
    fill: "#ffffff",
    description: "A tier inside a region: web, application, database (white box).",
  }),
  "gcp:gke-cluster": gcp({
    label: "GKE cluster",
    stroke: "#1f2124",
    fill: "#ffffff",
    icon: "gcp:gke",
    description: "A Google Kubernetes Engine cluster.",
  }),
  "gcp:on-prem": gcp({
    label: "On-premises",
    stroke: "#1f2124",
    fill: "#f1f3f4",
    icon: "tabler:building",
    description: "An on-premises environment.",
  }),
  "gcp:external": gcp({
    label: "External",
    stroke: "#edebea",
    fill: "#edebea",
    strokeWidth: 0,
    rounded: 0,
    description: "Third-party or external systems (grey zone).",
    source: "Google Cloud landing zone diagrams (legacy zone stencil), measured",
  }),
  "gcp:optional": gcp({
    label: "",
    stroke: "#1f2124",
    dash: "4 4",
    description: "An optional component boundary (dashed).",
  }),
  "gcp:users": gcp({
    label: "Users",
    stroke: "#1f2124",
    fill: "#ffffff",
    icon: "tabler:users",
    description: "End users or clients outside Google Cloud.",
    source: `${GCP_SVG}; inferred`,
  }),

  // ------------------------------------------------------------- Azure
  "azure:tenant": azure({
    label: "Microsoft Entra tenant",
    stroke: "#0078d4",
    labelColor: "#0063b1",
    rounded: 4,
    description: "A Microsoft Entra tenant.",
    source: "inferred (Azure publishes no tenant boundary style)",
  }),
  "azure:subscription": azure({
    label: "Subscription",
    stroke: "#0078d4",
    labelColor: "#0063b1",
    icon: "azure:subscriptions",
    rounded: 4,
    description: "An Azure subscription.",
    source: "inferred (not drawn in Azure's reference diagrams)",
  }),
  "azure:resource-group": azure({
    label: "Resource group",
    stroke: "#7f7f7f",
    dash: "3.5 2.5",
    icon: "azure:resource-groups",
    rounded: 4,
    description: "A resource group (dashed grey).",
    source: "inferred from Azure's optional-group dash (3.5 2.5, #7F7F7F)",
  }),
  "azure:region": azure({
    label: "Region",
    stroke: "#5b9bd5",
    dash: "3 3",
    labelColor: "#0a609e",
    description: "An Azure region (dashed blue).",
    source: "Azure diagrams label regions in #5B9BD5; the boundary is inferred",
  }),
  "azure:az": azure({
    label: "Zone 1",
    stroke: "#ffd965",
    fill: "#fafafa",
    strokeWidth: 1.5,
    rounded: 9,
    labelColor: "#0a609e",
    description: "An availability zone (yellow border, near-white fill).",
  }),
  "azure:vnet": azure({
    label: "Virtual network",
    stroke: "#a4cbfb",
    fill: "#a4cbfb",
    strokeWidth: 0,
    icon: "azure:virtual-networks",
    description: "A virtual network (light blue panel).",
  }),
  "azure:vnet-hub": azure({
    label: "Hub virtual network",
    stroke: "#1490df",
    dash: "3 3",
    icon: "azure:virtual-networks",
    description: "A hub or spoke virtual network in hub-spoke topologies (dashed blue).",
  }),
  "azure:subnet": azure({
    label: "Subnet",
    stroke: "#bfbfbf",
    fill: "#f8f8f8",
    description: "A subnet (light grey).",
  }),
  "azure:service-group": azure({
    label: "",
    stroke: "#bfbfbf",
    fill: "#f2f2f2",
    description: "A logical grouping: plan, monitoring, identity, data (grey).",
  }),
  "azure:optional": azure({
    label: "",
    stroke: "#7f7f7f",
    dash: "3.5 2.5",
    description: "An optional component boundary (dashed grey).",
  }),
  "azure:node-pool": azure({
    label: "Node pool",
    stroke: "#7f7f7f",
    dash: "2.25 2.25",
    fill: "#ffffff",
    description: "An AKS node pool (dashed grey, white).",
  }),
  "azure:on-prem": azure({
    label: "On-premises",
    stroke: "#bfbfbf",
    fill: "#f2f2f2",
    icon: "tabler:building",
    description: "An on-premises network.",
    source: `${AZURE_SVG}; inferred`,
  }),

  // ------------------------------------------------------------- Kubernetes
  "k8s:cluster": {
    label: "Kubernetes cluster",
    stroke: "#326ce5",
    labelColor: "#2457c5",
    icon: "k8s:kubernetes",
    rounded: 12,
    description: "A Kubernetes cluster (Kubernetes blue).",
    source: `${K8S_DECK}: cluster, node and pod groups are solid blue rounded boxes`,
  },
  "k8s:namespace": {
    label: "Namespace",
    stroke: "#1f2937",
    dash: "4 3",
    labelColor: "ink",
    icon: "k8s:namespace",
    rounded: 10,
    description: "A namespace (dashed).",
    source: `${K8S_DECK}: namespaces are dashed black rounded boxes`,
  },
  "k8s:node": {
    label: "Node",
    stroke: "#326ce5",
    labelColor: "#2457c5",
    icon: "k8s:node",
    rounded: 10,
    description: "A worker node.",
    source: K8S_DECK,
  },
  "k8s:control-plane": {
    label: "Control plane",
    stroke: "#326ce5",
    labelColor: "#2457c5",
    icon: "k8s:control-plane",
    rounded: 10,
    description: "The control plane.",
    source: K8S_DECK,
  },

  // ------------------------------------------------------------- C4 model
  "c4:boundary": {
    label: "",
    stroke: "#444444",
    dash: "6 4",
    labelColor: "#444444",
    rounded: 0,
    strokeWidth: 1.25,
    description: "A C4 system or container boundary (dashed grey).",
    source: C4,
  },

  // ------------------------------------------------------------- Generic
  box: { label: "", stroke: "#9aa3ae", description: "A plain bordered box.", source: STACKDRAW },
  dashed: {
    label: "",
    stroke: "#9aa3ae",
    dash: "6 4",
    description: "A dashed boundary.",
    source: STACKDRAW,
  },
  zone: {
    label: "",
    stroke: "#e3e7ec",
    fill: "#f4f6f8",
    rounded: 10,
    description: "A filled panel without a strong border, for tiers and lanes.",
    source: STACKDRAW,
  },
  boundary: {
    label: "",
    stroke: "#444444",
    dash: "6 4",
    labelColor: "#444444",
    rounded: 4,
    strokeWidth: 1.25,
    description: "A system boundary (dashed, C4 style).",
    source: C4,
  },
  "on-prem": {
    label: "On-premises",
    stroke: "#7d8998",
    fill: "#f4f6f8",
    icon: "tabler:building",
    description: "An on-premises site, vendor-neutral.",
    source: STACKDRAW,
  },
  internet: {
    label: "Internet",
    stroke: "#9aa3ae",
    dash: "2 3",
    icon: "tabler:world",
    description: "The public internet.",
    source: STACKDRAW,
  },
};

export const GROUP_STYLES: Record<string, GroupStyle> = Object.fromEntries(
  Object.entries(DEFS).map(([key, s]) => [
    key,
    {
      key,
      iconStyle: "inline",
      labelAlign: "left",
      strokeWidth: 1,
      rounded: 8,
      ...s,
    } as GroupStyle,
  ]),
);

/** Group types accepted as shorthand for a full key ("vpc" -> "aws:vpc" is not guessed; these are exact). */
const TYPE_ALIASES: Record<string, string> = {
  "aws:availability-zone": "aws:az",
  "aws:subnet-public": "aws:public-subnet",
  "aws:subnet-private": "aws:private-subnet",
  "aws:sg": "aws:security-group",
  "aws:asg": "aws:auto-scaling",
  "aws:auto-scaling-group": "aws:auto-scaling",
  "aws:on-prem": "aws:corporate-dc",
  "aws:data-center": "aws:corporate-dc",
  "aws:corporate-data-center": "aws:corporate-dc",
  "aws:ec2-instance-contents": "aws:ec2-contents",
  "aws:greengrass": "aws:iot-greengrass",
  "aws:sfn": "aws:step-functions",
  "aws:beanstalk": "aws:elastic-beanstalk",
  "gcp:google-cloud": "gcp:cloud",
  "gcp:network": "gcp:vpc",
  "gcp:gke": "gcp:gke-cluster",
  "gcp:onprem": "gcp:on-prem",
  "azure:rg": "azure:resource-group",
  "azure:virtual-network": "azure:vnet",
  "azure:availability-zone": "azure:az",
  "azure:onprem": "azure:on-prem",
  "k8s:ns": "k8s:namespace",
  generic: "box",
  group: "box",
  onprem: "on-prem",
};

export function resolveGroupStyle(type: string): GroupStyle | undefined {
  const key = type.trim().toLowerCase();
  return GROUP_STYLES[key] ?? GROUP_STYLES[TYPE_ALIASES[key] ?? ""];
}

export function groupStyleKeys(): string[] {
  return [...Object.keys(GROUP_STYLES), ...Object.keys(TYPE_ALIASES)];
}
