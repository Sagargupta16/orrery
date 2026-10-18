# Conventions rubric: flowcharts (ISO 5807)

Applies when the spec says `kind: flowchart`. ISO 5807:1985, *Information processing: documentation symbols and conventions for data, program and system flowcharts, program network charts and system resources charts*, is sold by ISO and not freely published, so the quotes below come from the American standard for the same symbols, quoted verbatim:

- ANSI X3.5-1970, *Flowchart Symbols and Their Usage in Information Processing*, as adopted for the US federal government in FIPS PUB 24 (1973): <https://nvlpubs.nist.gov/nistpubs/Legacy/FIPS/fipspub24.pdf> (X3.5 below, with the clause).

**[measured]** rules are checked by `orrery review` (finding id given); do not re-report them. **[judged]** rules are yours: report a violation with the rule id, its quote and the spec ids. **[renderer]** rules are applied by orrery and cannot be fixed from the spec; do not report them.

How orrery carries the symbols: `shape: terminator` (or `terminal`, a pill) for start and end, `process` (a box), `decision` (a diamond), `input`, `output`, `data` or `io` (a parallelogram), `predefined` (a box with side bars), `manual` (a trapezoid), `document`, `database` (a cylinder), `delay`. Exits of a decision are edge labels (`- check -> pay: yes`).

## Start and end

### FC-01 One start terminator, and every path ends at one [measured: `conventions.flowchart-terminals`]

> "The symbol shown below represents a terminal point in a flowchart, for example, start, stop, halt, delay, or interrupt." (X3.5 3.4.2)

The measurement counts terminators nothing leads into (starts: exactly one) and terminators nothing leaves (ends: at least one). Judge whether every path reaches an end: a path that stops at a process box leaves the reader unsure whether the work is over, and two ends that read the same ("End", "End") tell the reader nothing about the outcome ("Order approved", "Order rejected").

### FC-02 Flow runs top to bottom and left to right [measured: `layout.against-flow`]

> "Normal direction of flow is from left to right and top to bottom. When the flow direction is not left to right or top to bottom, open arrowheads shall be placed on reverse-direction flowlines." (X3.5 4.4.1)

A loop back to an earlier step runs against the flow by nature and keeps its arrowhead; judge whether the main path keeps the direction. Patch: `set direction down` for a long chain, `move` a step after its source.

## Decisions

### FC-03 A decision has an exit per answer, each labelled [measured: `conventions.flowchart-decision`]

> "The symbol shown below represents a decision or switching-type operation that determines which of a number of alternative paths is to be followed." (X3.5 3.3.2.1)
>
> "Each exit from a symbol shall be identified to show the logic path which it represents." (X3.5 4.10.2)

The measurement finds a decision with fewer than two exits or an unlabelled exit. Judge the wording: the decision label is a question ("Credit OK?") and its exits are its answers ("yes", "no", or the values tested), the same words for the same answer across the chart.

## Symbols

### FC-04 Parallelograms only for input and output [judged]

> "The symbol shown below represents an input/output function (I/O), that is, the making available of information for processing (input), or the recording of processed information (output)." (X3.5 3.2.1)

Flag a parallelogram for a step that reads or writes nothing ("Approve order"), and a step that does read input or write output ("Enter order details", "Print invoice") drawn as a plain box. Patch: `set nodes.<id>.shape`.

### FC-05 The process box is for work that changes something [judged]

> "The symbol shown below represents any kind of processing function; for example, the process of executing a defined operation or group of operations resulting in a change in value, form, or location of information, or in the determination of which of several flow directions are to be followed." (X3.5 3.2.2)

Steps are boxes named verb plus object ("Reserve stock"); a rounded or pill shape for an ordinary step reads as a terminator.

### FC-06 Predefined and manual steps say so [judged]

> "The symbol shown below represents a named process consisting of one or more operations or program steps that are specified elsewhere, for example, subroutine or logical unit." (X3.5 3.3.2.2)
>
> "The symbol shown below represents any offline process geared to the speed of a human being, without using mechanical aid." (X3.5 3.3.2.4)

A step defined in another chart or system (a credit check service, a subroutine) is `shape: predefined`; work a person does by hand is `shape: manual`. Flag either drawn as a plain box when the label makes it clear.

## Lines

### FC-07 Crossing lines carry no meaning [measured: `layout.crossings`]

> "Flowlines may cross; this means they have no logical interrelation." (X3.5 3.2.3.1)

Crossings are allowed but cost the reader; cite `layout.crossings` when proposing a reorder.

### FC-08 Symbols keep their shape and orientation [renderer]

> "The orientation of each symbol on a flowchart should be the same as shown in Section 3, Flowchart Symbols." (X3.5 4.3)
