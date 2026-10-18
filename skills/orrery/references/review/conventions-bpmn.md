# Conventions rubric: BPMN 2.0

Applies when the spec says `kind: process`. Sources, quoted verbatim:

- OMG, *Business Process Model and Notation (BPMN) Version 2.0.2* (formal/2013-12-09): <https://www.omg.org/spec/BPMN/2.0.2/PDF> (BPMN below, with the clause).
- Camunda, *Naming BPMN elements*: <https://docs.camunda.io/docs/components/best-practices/modeling/naming-bpmn-elements/> (Naming below), and *Creating readable process models*: <https://docs.camunda.io/docs/components/best-practices/modeling/creating-readable-process-models/> (Readable below). The standard defines what the symbols mean; it sets no naming style, so the naming rules come from this practice guide.

**[measured]** rules are checked by `orrery review` (finding id given); do not re-report them. **[judged]** rules are yours: report a violation with the rule id, its quote and the spec ids. **[renderer]** rules are applied by orrery and cannot be fixed from the spec; do not report them.

How orrery carries BPMN: each element is a node with `bpmn:` (events `start`, `start-message`, `end`, `end-error` and the rest; gateways `exclusive`, `parallel`, `inclusive`, `event-based`, `complex`; activities `task`, `user-task`, `service-task` and the rest; `data-object`, `data-store`), participants are groups with `type: pool`, roles are `type: lane` groups inside them, and an edge's `flow:` says what it is (`sequence` by default, `message`, `default`, `conditional`, `association`). Events and gateways carry their label under the symbol.

## Events

### BPMN-01 Every process starts and ends at an event [measured: `conventions.bpmn-start-end`]

> "As the name implies, the Start Event indicates where a particular Process will start." (BPMN 10.5.2)
>
> "As the name implies, the End Event indicates where a Process will end." (BPMN 10.5.3)
>
> "Model the trigger and the end status of processes by always explicitly showing the start and end event symbols." (Readable, Modeling start and end events)

The measurement checks each pool whose process is drawn (a black-box pool has none). Judge whether every path reaches an end event: a branch that stops at a task leaves the reader unsure whether the process is over.

### BPMN-02 Start events name the trigger, end events the outcome [judged]

> "Start event labels informs the reader of how the process is triggered." / "Labeled end events characterize end results of the process from a business perspective." (Readable, Labeling BPMN elements)

Flag an unlabelled start or end event, and two end events that a reader cannot tell apart (both "Done").

### BPMN-03 Events are named as states [judged]

> "Wherever possible, name an event using an object and a verb reflecting a state. Always try to describe which state an object is in when the process is about to leave the event." (Naming, Naming events)
>
> "Avoid very broad and general verbs like "Invoice processed" or "Order handled"!" (Naming, Naming events)

"Order received", "Invoice paid", "Order rejected" pass; "Receive order" (an activity name) and "Order processed" (says nothing about the outcome) do not. Patch: `set nodes.<id>.label`.

## Activities

### BPMN-04 Splitting gateways ask a question and each branch answers it [measured: `conventions.bpmn-gateway`]

> "Label a data-based exclusive gateway with a question. Label the outgoing sequence flows with the conditions they are executed under. Formulate the conditions as answers to the question posed at the gateway." (Naming, Naming gateways)
>
> "A Decision can be thought of as a question that is asked at a particular point in the Process. The question has a defined set of alternative answers." (BPMN 10.6.2)

The measurement finds a splitting exclusive or inclusive gateway with no label or with an unlabelled branch (a `flow: default` branch is marked by its slash and may stay unlabelled). Judge whether the branch labels answer the question: "Credit OK?" answered by "approved" and "manual check" reads worse than "Yes" and "No".

### BPMN-05 Tasks are named verb plus object [judged]

> "Name a task using an object and a verb in the infinitive. By doing this, you consistently describe what you do with an object." (Naming, Naming activities)
>
> "Avoid very broad and general verbs like "Handle invoice" or "Process order." Try to be more specific about what you do in your activity from a business perspective." (Naming, Naming activities)

"Check credit", "Ship goods" pass; "Credit", "Shipping", "Handle order" do not. A subprocess or call activity takes a noun form ("Order fulfillment"). Patch: `set nodes.<id>.label`.

## Gateways

### BPMN-06 Parallel branches are joined by a parallel gateway [measured: `conventions.bpmn-join`]

> "For incoming flows, the Parallel Gateway will wait for all incoming flows before triggering the flow through its outgoing Sequence Flows." (BPMN 10.6.4)
>
> "Try to model symmetrically. Identify related splitting and joining gateways and form easily recognizable visual, eventually nested, blocks with those gateways." (Readable, Modeling symmetrically)

The measurement finds branches of a parallel split that first meet at something that does not wait (a task, an exclusive gateway), where the work after it runs once per branch. Judge the shape: each split has its join, nested blocks close in the reverse order they open, and a split is drawn as a gateway rather than several flows out of one task:

> "Always model splitting the process flow by explicitly showing the gateway symbol" (Readable, Splitting sequence flows with parallel gateways)

### BPMN-07 Message flows run between pools; sequence flows stay inside one [measured: `conventions.bpmn-pools`]

> "A Message Flow MUST connect two separate Pools. They connect either to the Pool boundary or to Flow Objects within the Pool boundary. They MUST NOT connect two objects within the same Pool." (BPMN 9.4)
>
> "The Sequence Flows can cross the boundaries between Lanes of a Pool (see page 304 for more details on Lanes), but cannot cross the boundaries of a Pool." (BPMN 9.3)

Judge also that each message flow names the message it carries ("Purchase order", "Invoice"): the measurement does not count pools as boundaries that need a label.

> "A Message Flow is used to show the flow of Messages between two Participants that are prepared to send and receive them." (BPMN 9.4)

### BPMN-08 Only deciding gateways are named [judged]

> "Avoid naming event-based gateways, but ensure you name their subsequent events. Also, avoid naming parallel gateways and all forms of joining gateways. You don't need to specify anything about those gateways, as the flow semantics are always the same." (Naming, Naming gateways)

Patch: `unset nodes.<id>.label` on a parallel or joining gateway.

### BPMN-09 Gateways, not conditional flows, split the flow [judged]

> "However, experience shows that readers understand the flow semantics of gateways better, which is why we do not make use of this possibility." (Readable, Using gateways instead of conditional flows)

Flag a task with several `flow: conditional` edges out of it; propose an exclusive or inclusive gateway after the task.

## Pools and lanes

### BPMN-10 Pools are participants, lanes are roles [judged]

> "A Pool is the graphical representation of a Participant in a Collaboration." (BPMN 9.3)
>
> "Lanes are often used for such things as internal roles (e.g., Manager, Associate), systems (e.g., an enterprise application), an internal department (e.g., shipping, finance), etc." (BPMN 10.8)
>
> "If you have more than one lane in a pool, name each lane using the organizational role or technical system responsible for carrying out the activities shown in the lane." (Naming, Naming processes)

A pool is named for an organization or party (Customer, Supplier, Bank); a lane for the role, department or system that does its tasks (Sales, Warehouse, Payment service). Flag a lane named for a phase or a step ("Checkout", "Step 2"): phases are the order of the flow, not who does it. Patch: `set groups.<id>.label`.

## Layout

### BPMN-11 The flow reads left to right [measured: `layout.against-flow`]

> "Model process diagrams from left to right." (Readable, Modeling from left to right)
>
> "Avoid sequence flows violating the reading direction, meaning no outgoing flows on the left or incoming flows on the right of a symbol." (Readable, Creating readable sequence flows)

A loop back to an earlier task runs against the flow by nature; judge whether the other edges keep the direction.

### BPMN-12 Pools in the order the parties join [judged]

> "Rearrange the order of pools in a collaboration diagram to avoid message flows crossing pools as much as possible. Often, you will find a "natural" order of pools reflecting the order of first involvement of parties in the end-to-end process." (Readable, Creating readable sequence flows)

Cite `layout.crossings` when message flows cross a pool on their way. Patch: `move` the pool groups.

### BPMN-13 Notation as the standard draws it [renderer]

> "A Message Flow is a line with an open circle line start and an open arrowhead line end that MUST be drawn with a dashed single line" (BPMN 9.4)

Event circles, gateway diamonds and their markers, task corners and the message flow line are drawn by orrery from `bpmn:` and `flow:`. A message flow's dashed line and an association's dotted line need no legend entry.
