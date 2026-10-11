# Patterns

Reference architectures as spec fragments. Each has a complete example in `examples/` (start one with `diagramify init <name>`). Fragments use aliases; `diagramify icons search` confirms any id.

## Web application, three tiers (`aws-three-tier`)

Tiers read best top to bottom, with one Availability Zone per column.

```yaml
direction: down
groups:
  cloud:  { type: aws:cloud }
  region: { type: aws:region, label: us-east-1, in: cloud }
  vpc:    { type: aws:vpc, in: region }
  az-a:   { type: aws:az, label: Availability Zone A, in: vpc }
  pub-a:  { type: aws:public-subnet, in: az-a }
  priv-a: { type: aws:private-subnet, in: az-a }
nodes:
  alb:  { icon: aws:alb, label: Application Load Balancer, in: vpc }
  web-a: { icon: aws:ec2, label: Web server, in: priv-a }
  db-a: { icon: aws:aurora, label: Aurora primary, in: priv-a }
edges:
  - alb -> web-a
  - web-a -> db-a: SQL
```

Put shared entry points (load balancer, NAT) in the VPC or public subnets, repeat the per-zone stack in each zone, and draw replication between zones as a dashed edge with `constraint: false` (`- db-a --> db-b: { label: replication, constraint: false }`) so it does not stack the zones. An Auto Scaling group that spans the zones is an overlay: `asg: { type: aws:auto-scaling, around: [web-a, web-b] }`. To keep public subnets above private ones while an arrow points up into them, write the edge in layout order and flip the arrowhead: `{ from: nat-a, to: web-a, arrow: start }`.

## Serverless API (`aws-serverless-api`)

Client -> edge (CloudFront) -> API Gateway -> Lambda -> data stores, with Cognito beside the API. Use `direction: right`; put the identity provider before the API so the auth edge stays short.

## Event-driven (`aws-event-driven`)

A bus in the middle with producers on the left and consumers on the right. Async hops are dashed (`-->`); numbered `step:` edges tell the story:

```yaml
edges:
  - checkout -> bus: { label: OrderPlaced, step: 1 }
  - bus --> billing-queue: { step: 2 }
  - bus --> email-topic: { step: 3 }
```

Wrap a Step Functions state machine in `type: aws:step-functions`.

## Data lake and analytics (`aws-data-lake`, `gcp-streaming-analytics`)

Sources -> ingestion -> storage zones -> processing -> query and BI. Draw zones (raw, curated, analytics) as `type: zone` groups with short labels so the left-to-right story is the data's maturity. Catalogs and governance (Glue Data Catalog, Lake Formation) sit below the zones with dotted edges (`..>`).

## Retrieval augmented generation (`aws-genai-rag`)

Two flows in one picture: ingestion (documents -> chunk and embed -> vector store) and query (user -> API -> retrieve -> model -> answer). Put them in two `zone` groups labelled "Ingestion" and "Query" so they do not interleave.

## Kubernetes workload (`k8s-workload`)

```yaml
groups:
  cluster: { type: k8s:cluster }
  ns:      { type: k8s:namespace, label: shop, in: cluster }
nodes:
  ing: { icon: k8s:ing, label: Ingress, in: ns }
  svc: { icon: k8s:svc, label: Service, in: ns }
  dep: { icon: k8s:deploy, label: web, note: 3 replicas, in: ns }
  pod: { icon: k8s:pod, badge: x3, in: ns }
  cm:  { icon: k8s:cm, label: ConfigMap, in: ns }
edges:
  - ing -> svc -> pod
  - dep ..> pod: manages
  - cm ..> pod: mounts
```

Ownership edges (Deployment manages ReplicaSet manages Pods) are dotted; traffic edges are solid.

## CI/CD (`github-actions-cicd`)

Developer -> pull request -> GitHub Actions -> registry -> deploy target, with the cloud credentials step explicit (OIDC to an IAM role) because that is what reviewers look for. Mix `github:` Octicons for repository concepts, `logos:github-actions` for Actions and the cloud's own icons for the targets.

## Hybrid and multi-account networking (`aws-hybrid-network`, `multi-cloud`)

On-premises (`aws:corporate-dc`, `gcp:on-prem`, `azure:on-prem` or neutral `on-prem`) on the left, connectivity (Direct Connect, VPN, Interconnect, ExpressRoute) in the middle, a hub (Transit Gateway, Network Connectivity Center, a hub VNet) and the spoke networks on the right, each spoke inside its account or subscription group.

## System design interview style (`system-design-url-shortener`, `system-design-chat`)

Vendor-neutral icons (`generic:`) plus product logos where a product is named:

```yaml
nodes:
  users: { icon: generic:users, label: Clients }
  lb:    { icon: generic:load-balancer, label: Load balancer }
  api:   { icon: generic:servers, label: API servers, badge: x3 }
  cache: { icon: logos:redis, label: Redis, note: cache-aside }
  db:    { shape: cylinder, label: URL store, note: "key: short code" }
  log:   { shape: queue, label: Click events }
edges:
  - users -> lb -> api
  - api -> cache: read
  - api -> db: on miss
  - api --> log: async
```

Shapes (`cylinder` for databases, `queue` for streams, `person` for actors, `document` for files) keep a whiteboard feel when the product does not matter.

## C4 model (`c4-container`)

Person -> system boundary containing containers -> external systems:

```yaml
groups:
  system: { type: boundary, label: Online shop }
nodes:
  shopper: { shape: person, label: Shopper }
  web:     { shape: rounded, label: Web app, note: "React, TypeScript", in: system }
  api:     { shape: rounded, label: API, note: "Go, REST", in: system }
  db:      { shape: cylinder, label: Database, note: PostgreSQL, in: system }
  pay:     { shape: box, label: Payment provider, color: "#6b7280" }
```

## ML platform (`ml-platform`)

Feature pipeline -> feature store -> training -> model registry -> serving (batch and online) -> monitoring feeding back to training (a dashed edge back is fine; ELK routes feedback around the main flow).

## Observability (`observability-stack`)

Applications with SDKs -> collector -> one store per signal (metrics, logs, traces) -> dashboards and alerting. Group the stores in a `zone` so the three parallel lanes line up.
