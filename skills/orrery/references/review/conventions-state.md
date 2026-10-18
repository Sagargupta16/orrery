# Conventions rubric: UML state machines

Applies when the spec says `kind: state`. Source, quoted verbatim:

- OMG, *Unified Modeling Language (UML) Version 2.5.1* (formal/2017-12-05): <https://www.omg.org/spec/UML/2.5.1/PDF> (UML below, with the clause).

**[measured]** rules are checked by `orrery review` (finding id given); do not re-report them. **[judged]** rules are yours: report a violation with the rule id, its quote and the spec ids. **[renderer]** rules are applied by orrery and cannot be fixed from the spec; do not report them.

How orrery carries a state machine: states are nodes (rounded by default), `shape: initial` is the initial pseudostate, `shape: final` the final state, a group is a composite state with its own region, and each edge is a transition whose label is its trigger, guard and effect. A state machine returns to earlier states by design, so `layout.against-flow` is not reported for it.

## Pseudostates and final states

### SM-01 One initial pseudostate per region, with one transition out [measured: `conventions.state-initial`]

> "There can be at most one initial Vertex in a Region." (UML 14.2.3.7)
>
> "An initial Vertex can have at most one outgoing Transition." (UML 14.5.6, constraint initial_vertex)

The measurement also reports a top level with no initial pseudostate: without one the reader cannot tell where the machine starts.

### SM-02 The initial transition has no trigger or guard [judged]

> "The outgoing Transition from an initial vertex may have a behavior, but not a trigger or a guard." (UML 14.5.6, constraint outgoing_from_initial)

Flag a label such as `order placed [paid]` on the edge out of `shape: initial`: the trigger belongs on the next transition. An effect (`/ create order`) is fine. Patch: `edge` with the label moved.

### SM-03 Nothing leaves a final state [measured: `conventions.state-final`]

> "A FinalState cannot have any outgoing Transitions." (UML 14.5.2, constraint no_outgoing_transitions)

## States and transitions

### SM-04 States are named for the condition that holds [judged]

> "A State models a situation in the execution of a StateMachine Behavior during which some invariant condition holds. In most cases this condition is not explicitly defined, but is implied, usually through the name associated with the State." (UML 14.2.3.4)

"Awaiting payment", "Shipped", "Idle" pass; "Ship order" or "Check payment" name an action, which belongs on a transition or as a state's activity. Patch: `set nodes.<id>.label`.

### SM-05 Transitions read trigger [guard] / effect [judged]

> "[<trigger> [‘,’ <trigger>]* [‘[‘ <guard>’]’] [‘/’ <behavior-expression>]]" (UML 14.2.4.8)

Each label leads with the event that fires the transition (`payment received`), a guard in square brackets when the event alone does not decide (`[amount > limit]`), and an effect after a slash (`/ send receipt`). Flag a transition that leaves a state with several exits and has no label: the reader cannot tell which event takes which exit. One unlabelled transition out of a state that finishes its own work is a completion transition and is fine.

### SM-06 Transitions out of one state are told apart [judged]

> "If more than one guard evaluates to true, one of these Transitions is chosen for continuing the traversal. The algorithm for making this selection is undefined." (UML 14.2.3.8.4)

Two transitions out of one state on the same trigger need guards that cannot both hold, or the diagram does not say which one happens; flag the same label on two exits of one state.
