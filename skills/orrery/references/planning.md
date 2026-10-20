# Planning a diagram from evidence

How the planner (the `orrery:planner` agent, or the main session where agents cannot run) turns a request and the code or infrastructure behind it into a plan the user confirms before any spec exists. The accuracy reviewer later checks the drawing against the same evidence, so every line of the plan carries its source.

## Contents

- [The plan](#the-plan)
- [Reading the evidence](#reading-the-evidence)
- [What is a flow](#what-is-a-flow)
- [What to leave out](#what-to-leave-out)
- [How many figures](#how-many-figures)
- [The confirm list](#the-confirm-list)

## The plan

The planner returns one JSON object; the orchestrator shows the confirm list to the user and writes specs from the figures.

```json
{
  "brief": "Orders API on AWS for the README: request path and async fulfilment",
  "evidence": ["infra/main.tf", "infra/queue.tf", "src/handler.ts"],
  "figures": [
    {
      "name": "orders-overview",
      "aspect": "overview",
      "title": "Orders platform",
      "kind": "architecture",
      "groups": [{ "id": "vpc", "type": "aws:vpc", "evidence": "infra/main.tf:12" }],
      "nodes": [
        { "id": "api", "label": "Orders API", "icon": "aws:lambda", "in": "vpc", "evidence": "infra/main.tf:40" }
      ],
      "edges": [
        { "from": "api", "to": "queue", "label": "enqueue", "source": "declared", "evidence": "src/handler.ts:88 (SendMessageCommand), infra/main.tf:61 (sqs:SendMessage)" }
      ],
      "leftOut": [{ "what": "CloudWatch log groups", "why": "cross-cutting; one Shared services box" }]
    }
  ],
  "standIns": [{ "service": "Internal billing API", "icon": "tabler:server", "why": "not an AWS service" }],
  "questions": ["Is the admin UI in scope?"]
}
```

- `evidence` on every node, group and edge: `path:line`, a resource address (`aws_lambda_function.api`) or `brief` when the user said it and no file shows it. Never leave it empty; a line with no source is a guess, and guesses go to `questions`.
- `source` on every edge: `declared` when the infrastructure wires it (an event source mapping, a subscription, an integration, a rule target), `inferred` when only code or configuration shows it (a client call, an environment variable holding a URL). The confirm list marks inferred flows so the user can check them first.
- `aspect`: `overview`, `request`, `data`, `deploy`, `failure` or `security`.
- Stay at the level of services and flows: no layout, no directions, no styling. Those are the author's and the measurement's job, and a plan that fixes them early passes its mistakes on to every figure.
- Icons come from `orrery icons search`; a service with no official icon is listed in `standIns` with the icon used in its place.

## Reading the evidence

Read the deployed shape first, the application code second: the infrastructure says what exists and where, the code says who calls whom.

| Evidence | Nodes from | Boundaries from | Flows from |
| --- | --- | --- | --- |
| Terraform (`*.tf`, a plan JSON) | resources (`aws_lambda_function`, `aws_lb`, `aws_rds_cluster`, `azurerm_*`, `google_*`), modules by their outputs | `provider` region and alias (Region, account), `vpc_id`, `subnet_ids`, `availability_zone` | event source mappings, subscriptions, rule targets, integrations, IAM statements whose actions and resources pair a caller with a target, security group rules between groups |
| CloudFormation, SAM, CDK (`cdk.out/*.template.json` beats `lib/*.ts`) | `Resources` by `Type`; constructs | `VpcConfig`, `SubnetIds`, stack Region and account | SAM `Events`, `!GetAtt`/`!Ref` inside policies and integrations, CDK `grant*` and `addEventSource` |
| Kubernetes manifests, Helm output | Deployments, StatefulSets, Jobs, Ingress or Gateway, Services that front them | namespaces, clusters, node pools | env vars and config holding another Service's DNS name, NetworkPolicy allow rules, Ingress routes |
| Docker Compose | services | networks | env vars holding another service's URL; `depends_on` is start order, not a flow |
| Application code | SDK clients (`new S3Client`, `boto3.client("sqs")`), HTTP clients and their hosts, queue and topic names | none | the call sites: every `send`, `publish`, `put`, `get`, `fetch` names a target |

Tools that draw from `terraform graph` or a state file show dependencies (what must exist first), which is not traffic: a Lambda depends on its IAM role, but no request travels between them. Read flows from the rows above, never from the dependency graph.

## What is a flow

An edge is a flow only when something moves: a request, a message, an event, a file, a replication stream. Draw it from the side that starts the exchange (the caller, the producer), except for pulls: when a function polls a queue or a stream, the arrow follows the data (queue to function), and the label says so (`polls`). Two resources that merely reference each other in the evidence (a role and its function, a bucket and its policy, a subnet and its route table) are not a flow.

## What to leave out

| Leave out | Unless |
| --- | --- |
| IAM roles, policies, security groups, route tables, NAT routes as nodes (they become edges, notes or a group) | the figure is about security or networking |
| Log groups, metrics, alarms, KMS keys, Secrets Manager, Config, CloudTrail fanning in from everything | three or fewer nodes use them: then dashed `logs` or `keys` edges. Otherwise one `Shared services` group with no arrows |
| `random_*`, `null_resource`, data sources, outputs, locals, provider plumbing | never |
| Per-environment copies (dev, staging, prod of the same stack) | the figure is about environments; otherwise draw one and say which in the subtitle |
| More than 25 nodes in one figure | never: split (next section) |

Every item left out goes in `leftOut` with its reason, so the user can put it back.

## How many figures

One figure per aspect: an overview, then one figure each for the flows that matter (request path, data pipeline, deployment, failure handling, security). Over about 15 nodes or more than three levels of nesting, draw an overview with the boundaries and the main path, then detail figures. Before keeping a figure, run the merge test: when every node of figure B is in figure A and B adds no flow A lacks, drop B.

## The confirm list

Before writing any spec, show the user four short lists and let them correct it; when told to proceed without questions, put the lists in the hand-off instead.

```text
Services:  API Gateway, Orders API (Lambda), Orders table (DynamoDB), Jobs queue (SQS), Worker (Lambda)
Boundaries: AWS Cloud > us-east-1 > VPC > private subnets (API, Worker)
Flows:     client -> API Gateway -> Orders API -> Orders table; Orders API -> Jobs queue (inferred: handler.ts:88); Jobs queue -> Worker (polls)
Left out:  log groups and KMS (Shared services box), IAM roles (edges), the dev stack (same shape)
```
