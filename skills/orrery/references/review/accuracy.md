# Accuracy rubric

Used by the accuracy reviewer (`orrery:accuracy-reviewer`). The other reviewers judge whether the picture follows the notation, tells the story and reads at its width; this one judges whether it is **true**: every box and line drawn exists in the evidence (the code, the infrastructure, the brief), and nothing on the main path is missing. Rule ids are stable; findings cite them. The plan format and the evidence table are in [../planning.md](../planning.md). The reviewer reads the sources itself and gets only the plan's `leftOut` list, never the planner's or author's reasoning: a verifier that sees how the work was done tends to agree with it.

| Id | Rule | Severity |
| --- | --- | --- |
| ACC-01 | Every node traces to the evidence (a file and line, a resource address) or to the brief. A node with neither is invented. | major |
| ACC-02 | Every edge is a flow the evidence shows: a call site, an event source mapping, a subscription, a rule target, an integration, an IAM grant paired with a call, a network rule. A dependency alone (`depends_on`, `terraform graph`, a role attached to a function) is not a flow. | major |
| ACC-03 | Arrows run from the side that starts the exchange (caller to callee, producer to consumer). A pull (a function polling a queue or stream) runs with the data, from the queue to the function. | major |
| ACC-04 | A service on the main request or data path in the evidence is drawn. Supporting services may be left out when the plan's `leftOut` names them. | major |
| ACC-05 | Boundaries match the deployment: a node inside a VPC, subnet, Availability Zone, account or Region group is deployed there (`subnet_ids`, `vpc_config`, provider region and account). | major |
| ACC-06 | Labels name the resource's real role (from its name, tags or handler), and the service by its official name somewhere in the figure. | minor |
| ACC-07 | A number in a note or badge (task count, memory, retention, replica count) matches the evidence. | minor |
| ACC-08 | Everything the brief asks the figure to show is drawn. | major |

## Evidence

Each finding quotes its source in `evidence`: `file` and `line` with the quoted text, or `brief` with the brief's words, or `missing` with the file and line of a service the figure does not draw. A finding with no source is not reported.

## Not this reviewer's job

Icons, colors, nesting rules and label size belong to the conventions and legibility reviewers; layout and step order to the flow reviewer and the measurement. Report only what makes the figure wrong about the system.
