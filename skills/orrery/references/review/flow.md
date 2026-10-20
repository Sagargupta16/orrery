# Flow rubric

For the flow reviewer: does the diagram tell the story of the system, in the right order, with arrows that mean what they say? Judge from the **spec and the review JSON first**, the PNG second: image critics miss connectivity ([PaperBanana](https://arxiv.org/html/2601.23265)) and vision models misjudge line crossings ([VLMs are blind](https://arxiv.org/html/2407.06581)). Crossings, hidden heads, shared lines and step order are measured; cite those numbers, never count them from the picture.

Rule ids are FLOW-nn. Each finding cites the rule id and, as evidence, a measured value (`layout.metrics.forwardPct`, a `flow.*` finding id) or the spec lines it is about.

## The main path

### FLOW-01 One main path in the diagram direction

The path a request or record takes from its entry point to its end reads in `direction` without doubling back. Evidence: `dimensions.layout.metrics.forwardPct`, `layout.against-flow`. Patches: `move` nodes so each sits after its source in the nodes list; `set direction`.

Side branches leave from the main-path node they belong to, not from a node further along: a cache the API reads hangs off the API, not off the database after it.

### FLOW-02 The entry point is where readers start

The actor or source that starts the flow (users, a client, an upstream system) sits first in reading order: left for `direction: right`, top for `down`. Patch: `move` it to the top of the nodes list.

Egress targets (the internet, a partner, a downstream system) sit at the far end of reading order, right for `direction: right`. Patch: `move` them to the end of the nodes list, or `rank: last`.

### FLOW-03 Connectivity matches the system

Every component the brief names is reached by the edges, and no edge connects things that do not talk in the real system. Read the edges in the spec, not the picture: list each node's in and out edges and compare them with the brief. A missing hop (the API writes to the queue but nothing reads it) is a major finding. Patch: `{ "op": "edge", "match": null, "value": "<from> -> <to>: <action>" }` adds an edge; `match` a line and `value: null` removes one.

## Arrows

### FLOW-04 Arrows point from the initiator

Each arrow runs from the component that starts the interaction to the one it depends on; replies are a separate edge (`arrow: start` or `<-`) only when the reply itself matters. See AZ-04. Evidence: the edge and its endpoints.

### FLOW-05 Two-headed and plain lines are deliberate

`flow.bidirectional` and `flow.undirected` list them. Judge each: request and response that both matter become two edges; a symmetric relationship (peering, replication between peers) may stay a plain line when the legend says so.

### FLOW-06 No ambiguous trunks

`flow.shared-trunk` lists unrelated edges drawn on one line. Propose the reorder that separates them; do not propose `layout.merge` changes unless the edges share an endpoint.

## Labels and steps

### FLOW-07 Labels say what the endpoints do not

An edge label gives the protocol, the action, sync or async, or the mechanism that crosses a boundary. A label that repeats a node name, or says "calls", "uses", "sends" with nothing else, is minor. `flow.unlabelled-boundary` lists unlabelled edges that cross a group; pick the ones a reader would ask about.

### FLOW-08 Steps tell the story in order

Numbered `step:` edges follow the order the request takes, start at 1, and read left to right, top to bottom, or clockwise (AWS-14). `flow.step-order` and `flow.step-numbering` are measured; judge whether the numbering matches the story in the brief (for example, authentication before the data call).

In a `process`, `flowchart` or `state` diagram the lines are the order and `flow.step-order` is not measured. Judge the main path instead: from the start event (or start terminator) along the branches the brief calls the normal case to an end, with every decision's branches labelled (BPMN-04, FC-03). A spec's `story:` lists the path the stage skin animates; it should be that same main path.

### FLOW-09 Line styles mean one thing each

A dashed line means the same thing everywhere (async, optional, replication) and the legend says which (AZ-13, C4-02). Flag a style used for two meanings.

## Boundaries

### FLOW-10 Edges cross boundaries where the system does

An edge that crosses a VPC, VNet, project or trust boundary is drawn to the component that sits on that boundary (load balancer, gateway, private endpoint), not straight to a component deep inside, unless the brief is a high-level view.

### FLOW-11 A group only for a real boundary [judged]

A group is a boundary something is deployed in, reached through or owned by: an AWS account, Region, VPC, subnet, Availability Zone or Auto Scaling group; an Azure subscription, resource group, virtual network or subnet; a Google Cloud project, region, zone or VPC network; a Kubernetes cluster or namespace; an on-premises site or data center; a trust zone; one service's own frame; a pool or lane in a process. A box around nodes that share none of these is noise. Azure asks for the system boundary itself (AZ-12); C4 draws it as the software system boundary. Patch: `unset groups.<id>` and `set nodes.<member>.in` to the parent.

### FLOW-12 Actors stay outside every group [judged]

Users, clients, partners and external systems sit outside every group, the cloud or system boundary included, on every vendor and in C4 (people and external systems outside the software system boundary). Patch: `unset nodes.<id>.in`.

### FLOW-13 Denied paths are red and say so [judged]

A path that is blocked on purpose (a firewall or security rule that denies, an organization policy, a WAF block, a network policy in a cluster) is drawn dashed in `#C7243A` with the label `denied`, and the legend says what dashed red means: color is never the only signal (AZ-15). Patch: `{ "op": "edge", "match": "<from> -> <to>", "value": { "from": "<from>", "to": "<to>", "line": "dashed", "color": "#C7243A", "label": "denied" } }`.

## Hubs

### FLOW-14 Hubs keep their targets together [judged]

A hub (one node with four or more edges) has its targets next to it, on one side. A fan-out labels each arrow at its target end, a fan-in labels the shared hop once. Patches: `move` the targets right after the hub, `align` them with the first target, or end the arrows on their group.
