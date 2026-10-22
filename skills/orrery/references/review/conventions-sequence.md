# Conventions rubric: sequence diagrams (UML interactions)

Applies when the spec says `kind: sequence`. Source, paraphrased with the clause (read the clause for its exact wording):

- OMG, *Unified Modeling Language (UML) Version 2.5.1* (formal/2017-12-05): <https://www.omg.org/spec/UML/2.5.1/PDF> (UML below, with the clause): 17.3 Lifelines, 17.4 Messages, 17.6 Fragments, 17.8 Sequence Diagrams.

**[measured]** rules are checked by `orrery review` (finding id given); do not re-report them. **[judged]** rules are yours: report a violation with the rule id, what the rule asks and the spec ids. **[renderer]** rules are applied by orrery and cannot be fixed from the spec; do not report them.

How orrery carries a sequence diagram: each node is a participant, drawn as its head (any look) over a dashed lifeline, left to right in spec order; a group is a box around participants that sit next to each other. Each edge is a message, top to bottom in spec order, so the order of `edges:` is time: `->` is a call, `-->` a reply or an asynchronous message, `..>` a signal, and an edge from a node to itself a self message. `fragments:` boxes ranges of messages (counted from 1 in `edges:` order) as `loop`, `alt`, `opt`, `par`, `break` or `critical`, with `else` branches for `alt` and `par`.

## Participants

### SEQ-01 Participants read left to right in the order they first take part [judged]

UML 17.8 leaves the order of lifelines to the modeler; the convention every guide follows is that the one who starts the scenario (the user, the browser, the calling service) stands leftmost and each next participant stands right of the one that calls it first, so most calls run left to right and replies come back right to left. Flag a participant that first appears in the middle of the story but stands at the left edge, or a scenario whose first message runs right to left. Patch: reorder `nodes:` (orrery draws them in spec order).

### SEQ-02 Every participant takes part [measured: `conventions.sequence-unused`]

A lifeline (UML 17.3) represents a participant of this interaction; one with no message is not part of the scenario and only widens the figure.

### SEQ-03 One scenario per figure [judged]

An interaction shows one behavior: one trigger and the exchange that follows from it (UML 17.8). Flag a figure that strings two scenarios together (sign-up, then a later purchase), or that draws every variant inline instead of naming the alternatives in an `alt`. Patch: split into two specs, or move the rare path into an `alt` branch.

## Messages

### SEQ-04 Every message says what it carries [measured: `conventions.sequence-unlabelled`; wording judged]

A message's label is its signature: the operation or signal and its arguments (UML 17.4). Lead with the verb or the operation and name the payload: `POST /token (code, code_verifier)`, `GET product:42`, `charge card (amount)`; a reply names what comes back: `200 profile`, `access and refresh tokens`. The measurement reports calls, asynchronous messages and signals with no label; a reply may stay unlabelled when its call already says what it returns. Flag labels that name a participant instead of an action (`to the API`) or say nothing (`request`, `call`, `data`). Patch: `edge` with the label.

### SEQ-05 Calls solid, replies dashed back to the caller [measured: `conventions.sequence-reply`]

UML 17.4 draws a reply as a dashed line and a call as a solid one; an asynchronous message, where the sender does not wait, also gets its own notation. In orrery a solid `->` is a call that waits, a dashed `-->` a reply when it answers a call to its sender and an asynchronous message otherwise, a dotted `..>` a signal. The measurement reports a solid message that answers the call just before it. Judge the rest: an asynchronous write drawn solid (`SET product:42` that nobody waits for) reads as a call; a reply that answers a different participant than the caller is drawn from the wrong lifeline.

### SEQ-06 Self messages only for work worth showing [judged]

A message from a participant to itself (UML 17.4) shows a step inside it: verifying a token, building a PKCE challenge. Flag one that only restates the call it follows (`handle request`), or several in a row that could be one. Patch: drop the edge or merge the labels.

## Fragments

### SEQ-07 Fragments only where they add meaning, with guards that are conditions [measured: `conventions.sequence-fragment` for ranges; the rest judged]

UML 17.6 gives each operator one meaning: `alt` a choice between branches (one per `else`), `opt` one branch that happens or not, `loop` a repetition, `par` branches that run in parallel, `break` a scenario that replaces the rest of the enclosing fragment, `critical` a region nothing interleaves with. A guard is a condition that holds for its branch (`cache hit`, `verifier matches`). The measurement reports a fragment whose range holds no drawn message or crosses another without nesting (orrery does not draw it). Flag an `alt` with one branch (it is an `opt`), a `loop` with no bound or condition, a guard that is an action (`call payments`), and a fragment around a single message that changes nothing. Patch: `fragments` with the corrected type, label or range.

## Size

### SEQ-08 One figure, at most about 12 to 16 messages [measured: `conventions.sequence-length`]

Past about 16 messages a reader stops following the order and starts searching. The measurement reports over 16 (minor) and over 24 (major). Split at a natural seam (sign-in, then the API call), fold a repeated exchange into one `loop`, or drop messages the story does not need (logging, retries).

## Groups

### SEQ-09 A box of participants marks a real boundary [judged]

A group around participants should be a deployment or trust boundary the reader needs (the AWS account, the browser, a third party), not decoration. Flag a box around every participant, or one whose members share nothing. Patch: remove the group, or regroup by where each participant runs.

## Drawing

### SEQ-10 Activation bars, filled heads and the names at the foot [renderer]

orrery draws an activation bar from each call to its reply (nested for a call back in, stretched to a second answer in another branch), filled arrowheads (`arrowhead: open` for chevrons), and repeats the participants' names under a tall diagram. Do not report them.
