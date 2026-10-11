# Group styles

`groups: { id: { type: <key> } }` picks one of these. `stackdraw styles` prints the live list. Every value below was read from, or measured on, the vendor's own material; "inferred" marks the few judgement calls. Values are px at 96 dpi.

## AWS

Read from the official PowerPoint toolkit in the [AWS Architecture Icons](https://aws.amazon.com/architecture/icons/) release of 2026-07-31 (light deck slide 25 "Groups", dark deck slide 23). Every group is a plain rectangle with square corners and no fill, a 1.25 pt (1.67 px) border, a black label (white on dark backgrounds) and the group's icon tile flush in the top-left corner. Dash lengths are derived from the DrawingML presets the deck uses (`dash`, `sysDash`).

| Type | Border | Dash | Header |
| --- | --- | --- | --- |
| `aws:cloud` (`aws:cloud-alt` uses the cloud tile) | #232F3E (the deck uses black) | solid | AWS logo tile, top left |
| `aws:account` | #E7157B | solid | account tile |
| `aws:region` | #00A4A6 | 5 1.67 | Region flag tile |
| `aws:az` | #00A4A6 | 6.67 5 | no icon, label centered |
| `aws:vpc` | #8C4FFF | solid | VPC tile |
| `aws:public-subnet` | #7AA116 | solid | lock tile |
| `aws:private-subnet` | #00A4A6 | solid | lock tile |
| `aws:security-group` | #DD344C | solid | no icon, label centered |
| `aws:auto-scaling` | #ED7100 | 6.67 5 | tile top center, label below |
| `aws:corporate-dc`, `aws:server-contents` | #7D8998 | solid | building / server tile |
| `aws:ec2-contents`, `aws:spot-fleet`, `aws:elastic-beanstalk` | #ED7100 | solid | matching tile |
| `aws:step-functions` | #E7157B | solid | Step Functions icon |
| `aws:iot-greengrass` | #7AA116 | solid | Greengrass tile |
| `aws:generic`, `aws:generic-dashed` | #7D8998 | solid / 6.67 5 | no icon, label centered |

From the deck's guidance pages:

- "Some groups cross multiple groups, such as Auto Scaling, while others are meant to nest inside another, such as a VPC and subnets." Use `around:` for the crossing ones.
- "When you have groups within groups, inner groups should have at least .05" buffer on all sides."
- "Use straight lines and right angles to connect objects wherever possible." Preset arrows "use the 'Open Arrow' in Size 4" (the default `arrowhead: open`).
- "AWS service names must fit on no more than two lines. AWS or Amazon should always be accompanied by the service name. Lines should never break mid-word."
- Numbered callouts "are black with bold white type" (white with black type on dark backgrounds): the `step:` edges.
- "Use the group with the AWS logo except in Regions where the AWS logo cannot be used"; there use `aws:cloud-alt`.

## Google Cloud

Google's [icon library](https://cloud.google.com/icons) and its product icons PDF cover icons only, with no container or arrow specification. The values come from Google Cloud Architecture Center diagrams (the deployment archetype pages updated 2025-08 and the security foundations blueprint updated 2025-05), measured from their SVG source. Boxes have a 6 px radius and dark 2 px outlines.

| Type | Look | Source |
| --- | --- | --- |
| `gcp:cloud` | Google blue (#4285F4) frame, #1F2124 outline, white label | deployment archetypes |
| `gcp:project` | #F1F3F4 panel | security foundations |
| `gcp:region` | #E8EAED panel | deployment archetypes |
| `gcp:vpc` | dashed 8 8 outline | deployment archetypes |
| `gcp:subnet` | dashed 4 4 outline | deployment archetypes |
| `gcp:tier` | white box (web, app, database tiers) | deployment archetypes |
| `gcp:zone` | dashed white box | inferred: Google's current diagrams tag zones on cards (green #CEEAD6, blue #D2E3FC, yellow #FEEFC3) instead of drawing zone containers |
| `gcp:gke-cluster` | white box with the GKE icon | deployment archetypes (box), icon added |
| `gcp:on-prem` | #F1F3F4 panel | security foundations |
| `gcp:external` | #EDEBEA zone | landing zone diagrams (older stencil) |
| `gcp:optional` | dashed 4 4 | security foundations |
| `gcp:users` | white box with a users glyph | inferred |

Product cards in those diagrams are white, about 192 x 70 with a 35 px icon: `look: card`. Arrows are #202124, 2 px, with an open head.

On icons, the PDF says: "In early 2025, we overhauled all of our Google Cloud product icons, greatly simplifying our system from over 250 unique icons to ~40" and, of the console icons, "these icons should not be used as of 2026". So stackdraw leaves the console icons out and follows Google's own product list instead: core products draw their unique icon and every other product draws its category's icon, under the product's name (`gcp:pubsub` draws the Data Analytics icon and reads "Pub/Sub"). The mapping is `scripts/gcp-products.json`, transcribed from the guide's product pages.

## Azure

Microsoft's [icon page](https://learn.microsoft.com/en-us/azure/architecture/icons/) and the Well-Architected [design diagrams guidance](https://learn.microsoft.com/en-us/azure/well-architected/architect-role/design-diagrams) give principles but no colors. The values come from Azure Architecture Center SVGs (baseline App Service, hub-spoke network, AKS baseline).

| Type | Look | Source |
| --- | --- | --- |
| `azure:vnet` | #A4CBFB light blue panel, no border, VNet icon | baseline App Service |
| `azure:subnet` | #F8F8F8 panel, #BFBFBF border | baseline App Service |
| `azure:az` | #FAFAFA panel, #FFD965 1.5 px border, 9 px radius, #0A609E label | baseline App Service |
| `azure:vnet-hub` | dashed 3 3 #1490DF | hub-spoke |
| `azure:service-group` | #F2F2F2 panel, #BFBFBF border | baseline App Service |
| `azure:optional` | dashed 3.5 2.5 #7F7F7F | baseline App Service |
| `azure:node-pool` | dashed 2.25 2.25 #7F7F7F, white | AKS baseline |
| `azure:region` | dashed #5B9BD5 | inferred: the diagrams only write the region as a label |
| `azure:subscription`, `azure:tenant`, `azure:resource-group` | blue or grey outlines | inferred: not drawn in Azure's reference diagrams |
| `azure:on-prem` | #F2F2F2 panel with a building glyph | inferred |

Azure diagrams use black 1 px connectors with filled heads (`arrowhead: filled`) and green numbered callouts.

From Microsoft's guidelines: "In diagrams, we recommend including the product name somewhere close to the icon", "Don't crop, flip, or rotate icons", "Don't distort or change icon shape in any way".

## Kubernetes

The Kubernetes blue #326CE5 comes from the [community icon set](https://github.com/kubernetes/community/tree/master/icons). The repository has no layout rules; its source deck draws clusters, nodes and pod groups as solid blue rounded boxes and namespaces as dashed black rounded boxes, and stackdraw follows that: `k8s:cluster`, `k8s:node`, `k8s:control-plane` (solid blue) and `k8s:namespace` (dashed). In the same deck, reference links are solid and "creates" links are dashed.

## C4 model

[c4model.com](https://c4model.com) defines the notation, not colors. `boundary` and `c4:boundary` follow C4-PlantUML v2.14.0: a dashed #444444 border with a #444444 label. For elements, C4-PlantUML uses person #08427B, software system #1168BD, container #438DD5, component #85BBF0 and external elements #999999; pass them as `color:` on shape nodes.

## Neutral styles

| Type | Look |
| --- | --- |
| `box` | thin grey border |
| `dashed` | dashed grey border |
| `zone` | light grey panel without a strong border, for tiers and lanes |
| `boundary` | C4-style dashed boundary |
| `on-prem` | grey panel with a building glyph |
| `internet` | dotted border with a globe glyph |

Any group takes `color:` (border and label), `fill:` (background or `none`), `icon:` (any icon id, or `false`) and `dashed:`.
