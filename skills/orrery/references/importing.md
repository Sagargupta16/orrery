# Importing

Every way to start a spec from something that already exists, from the most exact to the least.

## Contents

- [A picture orrery drew](#a-picture-orrery-drew)
- [Infrastructure](#infrastructure)
- [Mermaid](#mermaid)
- [Any other picture](#any-other-picture)

## A picture orrery drew

Every SVG and PNG orrery renders carries its spec (an SVG in `<metadata>`, a PNG in an `iTXt` chunk), so a picture in a README, a slide or a chat reopens as the spec that drew it:

```bash
orrery import picture docs/architecture.svg -o docs/architecture.yaml
```

Add `embed: false` at the top of a spec to keep it out of the pictures (when its notes or evidence paths should not travel with the image).

## Infrastructure

Deterministic: the same input gives the same spec, so CI can redraw a diagram without a model.

| Input | Command | Reads |
| --- | --- | --- |
| Terraform | `terraform show -json plan.out > plan.json`, then `orrery import terraform plan.json` | resources, modules, `count` and `for_each`, provider regions, VPC and subnet ids, event mappings, integrations, subscriptions, IAM statements paired with targets, security group rules |
| CloudFormation, SAM, AWS CDK | `orrery import cloudformation template.yaml`, or `orrery import cdk cdk.out/<Stack>.template.json` after `cdk synth` | `Resources` by type, `!Ref`, `!GetAtt` and `!Sub` inside policies and integrations, SAM `Events`, `VpcConfig` |
| Kubernetes | `orrery import kubernetes manifests/` (a file or a folder; render Helm and Kustomize first) | workloads, Services and their selectors, Ingress and Gateway routes, NetworkPolicies, environment values that hold another Service's name |
| Docker Compose | `orrery import compose docker-compose.yml` | services, networks, environment values that hold another service's URL |

Each importer follows [planning.md](planning.md): flows only from what moves data, glue left out and listed in a comment, counts as `badge: xN`, every item with `evidence:` so `orrery verify` can check it. Treat the result as a first draft: check the guessed icons it lists, then validate and review. A name with no ASCII letter or digit (a table called `用户`, say) gets the id `item-<hash>`, six hex of the name, and keeps the name as its label. A Terraform plan whose modules nest more than 64 levels deep is refused.

## Mermaid

`orrery import mermaid flow.mmd -o diagram.yaml` reads the diagram type from its first line.

- A flowchart keeps its nodes, subgraphs, edge styles and shapes (including Mermaid 11 `id@{ shape: cyl, label: ... }`) and gets an official icon where a label is exactly a product name.
- A `sequenceDiagram` becomes `kind: sequence`: participants, messages, `autonumber` as steps, and `loop`, `alt`, `opt`, `par`, `break` and `critical` as fragments.
- An `erDiagram` becomes `kind: er`: attributes as fields, crow's foot cardinality as `card:`.
- A `stateDiagram` (or `stateDiagram-v2`) becomes `kind: state`: `[*]`, composite states as groups, `<<choice>>`.
- A `gantt` becomes `kind: timeline`: sections as lanes, `after` as dependencies, `done`, `active` and `crit` as status, and milestones.

Ids with letters the spec does not accept become ASCII slugs and keep their text as the label. Notes and styling are left out with a warning. Any other type exits 1. `orrery render -f mmd` goes the other way, for places that render Mermaid natively.

## Any other picture

A whiteboard photo, a screenshot or a diagram from another tool has no spec inside, so a model reads it. In Claude Code, `/orrery:import-image <picture>` runs the `orrery:image-importer` agent; elsewhere follow the same passes yourself:

1. **Boundaries first.** List every frame or region with its label (cloud, account, network, cluster, lane), outermost to innermost.
2. **Then the nodes.** For each box or icon: its label as written, the boundary it sits in, and the official icon id from `orrery icons search` (never a guessed id; a generic shape when nothing matches, listed as a stand-in).
3. **Then the edges, one source at a time.** For each node, every line that leaves it: the target, the arrowhead, the line style and the label as written. Reading lines per source catches the ones a whole-picture pass misses.
4. **Write the spec and validate** until clean.
5. **Compare.** Render the spec and look at both pictures side by side: every box, label and line of the original has its counterpart. Fix what differs, at most two rounds, then report what is uncertain (a label that could not be read, a line whose end is ambiguous).
