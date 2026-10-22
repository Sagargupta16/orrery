// The review's dimensions, their weights and the catalog of every finding id with its cap.

export const DIMENSIONS = ["conventions", "layout", "grid", "flow", "overlap", "quality"] as const;
export type ReviewDimension = (typeof DIMENSIONS)[number];
export type ReviewSeverity = "blocker" | "major" | "minor";

/** Share of the total score per dimension. */
export const WEIGHTS: Record<ReviewDimension, number> = {
  conventions: 0.15,
  layout: 0.15,
  grid: 0.1,
  flow: 0.2,
  overlap: 0.2,
  quality: 0.2,
};

export interface FindingKind {
  dimension: ReviewDimension;
  /** The diagnostic code or vendor rubric rule this finding measures. */
  rule?: string;
  /** Most points this kind can take off its dimension. */
  cap: number;
  about: string;
}

/** Every finding id reviewScene emits. Model reviewers use rubric rule ids instead. */
export const FINDINGS = {
  "overlap.edge-through-node": {
    dimension: "overlap",
    rule: "DG201",
    cap: 60,
    about: "an edge runs through a node it does not connect",
  },
  "overlap.label-over-node": {
    dimension: "overlap",
    rule: "DG202",
    cap: 40,
    about: "an edge label covers a node",
  },
  "overlap.labels-collide": {
    dimension: "overlap",
    rule: "DG202",
    cap: 40,
    about: "two edge labels overlap",
  },
  "overlap.nodes-collide": {
    dimension: "overlap",
    rule: "DG203",
    cap: 60,
    about: "two nodes' drawn footprints overlap",
  },
  "overlap.edge-through-header": {
    dimension: "overlap",
    rule: "DG209",
    cap: 40,
    about: "an edge runs under a group header label, so it looks broken",
  },
  "overlap.edge-through-label": {
    dimension: "overlap",
    rule: "DG212",
    cap: 40,
    about: "an edge runs through another edge's label or step badge, or a node's label text",
  },
  "overlap.off-canvas": {
    dimension: "overlap",
    rule: "DG210",
    cap: 60,
    about: "something is drawn outside the canvas and gets cut off",
  },
  "overlap.badge": {
    dimension: "overlap",
    rule: "DG211",
    cap: 40,
    about: "a step badge or node badge covers a node, a label or another badge",
  },
  "overlap.overlay-encloses": {
    dimension: "overlap",
    rule: "DG213",
    cap: 30,
    about: "an overlay (around:) group draws around a node that is not a member",
  },
  "overlap.overlay-header": {
    dimension: "overlap",
    rule: "DG214",
    cap: 30,
    about: "an overlay (around:) group's header covers another group's header or a node",
  },
  "overlap.outside-group": {
    dimension: "overlap",
    cap: 30,
    about: "a node or group sticks out of its parent group or into its header",
  },
  "overlap.groups-collide": {
    dimension: "overlap",
    cap: 30,
    about: "two groups that do not nest overlap",
  },
  "overlap.edge-through-group": {
    dimension: "overlap",
    rule: "DG223",
    cap: 24,
    about:
      "an edge cuts through a group that holds neither of its ends, so it reads as belonging there",
  },
  "overlap.title-band": {
    dimension: "overlap",
    rule: "DG225",
    cap: 16,
    about:
      "an edge label sits in a group's title band, or a vertical run passes right beside the title, so it reads as part of the title",
  },
  "overlap.label-on-border": {
    dimension: "overlap",
    rule: "DG220",
    cap: 16,
    about: "an edge label sits on a group's border line, so the frame looks broken there",
  },
  "overlap.edge-skims-node": {
    dimension: "overlap",
    rule: "DG221",
    cap: 16,
    about: "an edge passes within 10px of a node it does not connect, so it reads as touching it",
  },
  "flow.head-hidden": {
    dimension: "flow",
    cap: 40,
    about: "an arrowhead sits under a label, badge, header or node, so the direction is lost",
  },
  "flow.shared-trunk": {
    dimension: "flow",
    cap: 32,
    about: "two unrelated edges run on the same line, so readers cannot tell them apart",
  },
  "flow.side-by-side": {
    dimension: "flow",
    cap: 12,
    about:
      "two unrelated edges run parallel within 12px of each other for over 48px, so they read as one double line",
  },
  "flow.step-order": {
    dimension: "flow",
    rule: "AWS-14",
    cap: 32,
    about: "step numbers do not follow reading order (left to right, top to bottom, or clockwise)",
  },
  "flow.step-numbering": {
    dimension: "flow",
    cap: 8,
    about: "step numbers skip a number or do not start at 1",
  },
  "flow.bidirectional": {
    dimension: "flow",
    rule: "AZ-04",
    cap: 12,
    about: "a two-headed arrow hides who initiates",
  },
  "flow.undirected": {
    dimension: "flow",
    rule: "AZ-03",
    cap: 12,
    about: "a line without an arrowhead leaves the relationship unclear",
  },
  "flow.unlabelled-boundary": {
    dimension: "flow",
    cap: 10,
    about: "an unlabelled edge crosses a group boundary",
  },
  "flow.head-on-bend": {
    dimension: "flow",
    rule: "DG222",
    cap: 15,
    about:
      "an arrowhead ends a zero-length segment or a straight run shorter than itself, so it points nowhere or sits on the bend",
  },
  "flow.arrow-short": {
    dimension: "flow",
    cap: 10,
    about:
      "an edge stops short of what it points at, or ends outside an icon's tile out where its label is",
  },
  "flow.unconnected": {
    dimension: "flow",
    rule: "DG208",
    cap: 12,
    about: "a node nothing connects to",
  },
  "flow.edge-budget": {
    dimension: "flow",
    cap: 6,
    about: "an architecture diagram with more edges than nodes, which reads as a call sequence",
  },
  "flow.cross-cutting": {
    dimension: "flow",
    cap: 12,
    about:
      "four or more edges into a monitoring, logging, audit, identity or key service; a shared services group says it without arrows",
  },
  "layout.against-flow": {
    dimension: "layout",
    cap: 30,
    about: "an arrowhead points against the diagram direction",
  },
  "layout.crossings": {
    dimension: "layout",
    cap: 30,
    about: "edges cross each other",
  },
  "layout.empty-space": {
    dimension: "layout",
    cap: 25,
    about: "a large empty rectangle inside the content",
  },
  "layout.sparse": {
    dimension: "layout",
    cap: 15,
    about:
      "the median empty gap between neighbouring nodes in a row or column is over 300px, so the picture is spread thin",
  },
  "layout.wide-pitch": {
    dimension: "layout",
    cap: 8,
    about:
      "the median centre-to-centre node pitch is over 400px while the gaps are fine, so labels are wider than they need to be",
  },
  "layout.aspect": {
    dimension: "layout",
    rule: "DG205",
    cap: 25,
    about: "the picture is a strip, hard to read in a document column",
  },
  "layout.too-wide": {
    dimension: "layout",
    rule: "DG205",
    cap: 15,
    about: "the canvas is wider than 2400px",
  },
  "layout.long-edge": {
    dimension: "layout",
    cap: 15,
    about: "an edge is far longer than the median edge",
  },
  "layout.fallback": {
    dimension: "layout",
    rule: "DG218",
    cap: 5,
    about: "ELK needed a fallback strategy, so spec order may not be kept",
  },
  "layout.empty-group": {
    dimension: "layout",
    rule: "DG207",
    cap: 10,
    about: "a group with nothing in it",
  },
  "layout.ignored": {
    dimension: "layout",
    rule: "DG219",
    cap: 9,
    about: "a placement setting layout could not honor, so the spec says more than the picture",
  },
  "layout.sparse-group": {
    dimension: "layout",
    cap: 12,
    about: "a group more than 65% empty",
  },
  "layout.beside-group": {
    dimension: "layout",
    cap: 12,
    about:
      "a node outside a group shares 20 to 80% of its height with it, so the two read as one row of peers",
  },
  "grid.ragged": {
    dimension: "grid",
    cap: 24,
    about:
      "items in one layer share no start, center or end line, or icons an edge joins in one row sit off one center line",
  },
  "grid.jog": {
    dimension: "grid",
    cap: 24,
    about: "an edge has a tiny step (under 6px) where it could run straight",
  },
  "grid.off-center": {
    dimension: "grid",
    cap: 21,
    about:
      "a group's content is off its center by more than 6px, or the ends on one face of an icon sit off its center or unevenly spread",
  },
  "grid.edge-on-border": {
    dimension: "grid",
    rule: "DG224",
    cap: 12,
    about: "a straight run lies on a group's border line, so the line hides under the frame",
  },
  "grid.uneven-gaps": {
    dimension: "grid",
    cap: 15,
    about: "gaps between layers vary a lot",
  },
  "grid.wide-gap": {
    dimension: "grid",
    cap: 12,
    about:
      "a gap between a group's rows or columns is over 160px, or over 2.5x its smallest and over 64px, so it reads as an empty band",
  },
  "grid.group-gap": {
    dimension: "grid",
    cap: 12,
    about:
      "two sibling groups sit further apart than the edge labels between them need (label plus 16px a side, at least 48px) plus 32px",
  },
  "grid.zig-zag": {
    dimension: "grid",
    cap: 15,
    about:
      "a one-to-one edge steps 12 to 180px between two parallel runs (a Z), so its ends are out of line",
  },
  "grid.avoidable-bend": {
    dimension: "grid",
    cap: 15,
    about:
      "a one-to-one edge turns once with a leg of 240px or less, or takes more bends than a clear simpler route between the same faces",
  },
  "grid.uneven-siblings": {
    dimension: "grid",
    cap: 12,
    about:
      "same-kind sibling groups in a row differ 10 to 40% in height (in a column, in width), which reads as a mistake",
  },
  "grid.padding": {
    dimension: "grid",
    cap: 12,
    about:
      "one side of a group's padding is over 80px and over 3x its tightest side, so the box does not hug its content",
  },
  "quality.label-size": {
    dimension: "quality",
    rule: "LEG-01",
    cap: 60,
    about: "node labels are too small at the display width",
  },
  "quality.text-size": {
    dimension: "quality",
    rule: "LEG-02",
    cap: 20,
    about: "the smallest text (notes, edge labels, badges) is too small at the display width",
  },
  "quality.icon-size": {
    dimension: "quality",
    rule: "LEG-03",
    cap: 15,
    about: "icons are too small to recognize at the display width",
  },
  "quality.contrast": {
    dimension: "quality",
    rule: "LEG-04",
    cap: 40,
    about: "text below the WCAG 2.2 contrast minimum",
  },
  "quality.node-count": {
    dimension: "quality",
    rule: "DG206",
    cap: 20,
    about: "more nodes than one diagram can carry",
  },
  "quality.long-label": {
    dimension: "quality",
    rule: "DG204",
    cap: 12,
    about: "a node label wraps to more than three lines",
  },
  "quality.mid-word-break": {
    dimension: "quality",
    rule: "AWS-07",
    cap: 12,
    about: "a label breaks in the middle of a word",
  },
  "conventions.legend-missing": {
    dimension: "conventions",
    rule: "DG217",
    cap: 30,
    about: "a line style is used without a legend that explains it",
  },
  "conventions.legend-unused": {
    dimension: "conventions",
    cap: 6,
    about: "the legend explains a line style the diagram does not draw",
  },
  "conventions.title-missing": {
    dimension: "conventions",
    rule: "C4-01",
    cap: 8,
    about: "the diagram has no title",
  },
  "conventions.subtitle-echo": {
    dimension: "conventions",
    cap: 4,
    about: "the subtitle repeats the title or only lists node labels, so it adds nothing",
  },
  "conventions.short-name": {
    dimension: "conventions",
    rule: "AWS-08",
    cap: 20,
    about: "an AWS short form with no full service name anywhere in the diagram",
  },
  "conventions.label-lines": {
    dimension: "conventions",
    rule: "AWS-07",
    cap: 15,
    about: "an AWS service label runs over two lines",
  },
  "conventions.callout-sizes": {
    dimension: "conventions",
    rule: "AWS-13",
    cap: 5,
    about: "step callouts come in more than one size",
  },
  "conventions.boundary-label": {
    dimension: "conventions",
    rule: "AWS-17",
    cap: 12,
    about: "an AWS boundary group's label does not name the boundary (Private subnet, VPC, Region)",
  },
  "conventions.service-group": {
    dimension: "conventions",
    rule: "AWS-18",
    cap: 12,
    about: "a group with an AWS service icon holds other services",
  },
  "conventions.service-label": {
    dimension: "conventions",
    rule: "AWS-19",
    cap: 15,
    about: "an AWS service icon's label does not name the service; the role belongs in note",
  },
  "conventions.c4-element": {
    dimension: "conventions",
    rule: "C4-04",
    cap: 24,
    about: "a C4 element lacks its type, description or technology",
  },
  "conventions.c4-relationship": {
    dimension: "conventions",
    rule: "C4-07",
    cap: 15,
    about: "a C4 relationship lacks a specific label or its technology",
  },
  "conventions.icon-recolored": {
    dimension: "conventions",
    rule: "AZ-06",
    cap: 15,
    about: "a brand mark is recolored",
  },
  "conventions.gcp-product-icon": {
    dimension: "conventions",
    rule: "GCP-02",
    cap: 24,
    about: "a Google Cloud product is drawn with another product's icon",
  },
  "conventions.bpmn-start-end": {
    dimension: "conventions",
    rule: "BPMN-01",
    cap: 24,
    about: "a process (or one pool's process) has no start event or no end event",
  },
  "conventions.bpmn-gateway": {
    dimension: "conventions",
    rule: "BPMN-04",
    cap: 24,
    about:
      "a splitting exclusive or inclusive gateway asks no question or leaves a branch unlabelled",
  },
  "conventions.bpmn-join": {
    dimension: "conventions",
    rule: "BPMN-06",
    cap: 20,
    about:
      "parallel branches meet at something other than a joining gateway, so what follows runs once per branch",
  },
  "conventions.bpmn-pools": {
    dimension: "conventions",
    rule: "BPMN-07",
    cap: 30,
    about:
      "a message flow inside one pool, or a sequence flow that crosses from one pool to another",
  },
  "conventions.flowchart-terminals": {
    dimension: "conventions",
    rule: "FC-01",
    cap: 20,
    about: "a flowchart without exactly one start terminator and at least one end terminator",
  },
  "conventions.flowchart-decision": {
    dimension: "conventions",
    rule: "FC-03",
    cap: 24,
    about: "a decision with fewer than two exits, or an exit that does not say which answer it is",
  },
  "conventions.state-initial": {
    dimension: "conventions",
    rule: "SM-01",
    cap: 20,
    about:
      "a state machine with no initial pseudostate, more than one in a region, or one with several transitions out",
  },
  "conventions.state-final": {
    dimension: "conventions",
    rule: "SM-03",
    cap: 15,
    about: "a transition leaves a final state",
  },
  "conventions.journey-incomplete": {
    dimension: "conventions",
    rule: "JM-04",
    cap: 10,
    about: "a journey stage with no step, or a journey with no emotion score anywhere",
  },
  "conventions.er-primary-key": {
    dimension: "conventions",
    rule: "ER-03",
    cap: 20,
    about: "an entity with fields but no primary key field",
  },
  "conventions.er-cardinality": {
    dimension: "conventions",
    rule: "ER-05",
    cap: 20,
    about: "a relationship with no cardinality (card:), so neither end says how many",
  },
  "conventions.er-dangling-fk": {
    dimension: "conventions",
    rule: "ER-04",
    cap: 15,
    about: "a foreign key field that no relationship uses",
  },
  "conventions.er-orphan": {
    dimension: "conventions",
    rule: "ER-07",
    cap: 15,
    about: "an entity with no relationship to any other",
  },
  "conventions.er-many-to-many": {
    dimension: "conventions",
    rule: "ER-08",
    cap: 15,
    about: "a many-to-many relationship drawn directly instead of through a join entity",
  },
  "conventions.sequence-unlabelled": {
    dimension: "conventions",
    rule: "SEQ-04",
    cap: 20,
    about: "a message with no label, so the reader cannot tell what is sent",
  },
  "conventions.sequence-unused": {
    dimension: "conventions",
    rule: "SEQ-02",
    cap: 15,
    about: "a participant that sends and receives no message",
  },
  "conventions.sequence-reply": {
    dimension: "conventions",
    rule: "SEQ-05",
    cap: 15,
    about: "a reply to the caller right after its call is drawn solid instead of dashed",
  },
  "conventions.sequence-fragment": {
    dimension: "conventions",
    rule: "SEQ-07",
    cap: 20,
    about: "a fragment whose range is empty or crosses another fragment",
  },
  "conventions.sequence-length": {
    dimension: "conventions",
    rule: "SEQ-08",
    cap: 10,
    about: "more messages (over 16) than one figure reads well",
  },
  "conventions.timeline-undated": {
    dimension: "conventions",
    rule: "TL-01",
    cap: 20,
    about: "a timeline item with no date, so it has no place on the axis",
  },
  "conventions.timeline-order": {
    dimension: "conventions",
    rule: "TL-08",
    cap: 20,
    about: "a dependency whose target starts before its source ends",
  },
  "conventions.timeline-range": {
    dimension: "conventions",
    rule: "TL-03",
    cap: 15,
    about: "an item that falls outside the axis bounds",
  },
  "conventions.timeline-legend": {
    dimension: "conventions",
    rule: "TL-07",
    cap: 10,
    about: "item statuses are drawn but no legend says what they mean",
  },
  "conventions.timeline-crowded": {
    dimension: "conventions",
    rule: "TL-11",
    cap: 10,
    about: "point labels that had to stack more than three deep",
  },
} as const satisfies Record<string, FindingKind>;

export type FindingId = keyof typeof FINDINGS;
