# Conventions rubric: C4 model

Applies when a group uses a `c4:` type or the title or subtitle names C4. Sources, quoted verbatim:

- C4 model, *Notation*: <https://c4model.com/diagrams/notation> (Notation below).
- C4 model, *Review checklist*: <https://c4model.com/diagrams/checklist> (Checklist below).

**[measured]** rules are checked by `orrery review` (finding id given); do not re-report them. **[judged]** rules are yours: report a violation with the rule id, its quote and the spec ids.

How orrery carries C4 notation: the element type and technology go in brackets in `note` (`note: "[Container: Go] Catalog, cart and checkout"`, `[Person]`, `[Software System]`), the relationship technology in brackets in the edge label (`Reads and writes orders [SQL]`), and line styles in `legend:`.

## Diagram

### C4-01 A title that states type and scope [measured: `conventions.title-missing`]

> "Every diagram should have a title describing the diagram type and scope" (Notation)

The measurement only sees whether a title exists. Judge whether it names the diagram type (system context, container, component) and the scope (which software system).

### C4-02 A key [measured: `conventions.legend-missing`]

> "Every diagram should have a key/legend explaining the notation being used" (Notation)

### C4-03 Acronyms everyone understands [judged]

> "Acronyms and abbreviations (business/domain or technology) should be understandable by all audiences" (Notation)

## Elements

### C4-04 Every element has a type [measured: `conventions.c4-element`]

> "The type of every element should be explicitly specified" (Notation)

### C4-05 Every element has a short description [measured: `conventions.c4-element`]

> "Every element should have a short description, to provide an "at a glance" view of key responsibilities." (Notation)

Judge the content: the description says what the element does for this system, not what the product is in general.

### C4-06 Containers and components name their technology [measured: `conventions.c4-element`]

> "Every container and component should have a technology explicitly specified." (Notation)

### C4-07 Every relationship is labelled with its intent [measured: `conventions.c4-relationship`]

> "Every line should be labelled, the label being consistent with the direction and intent of the relationship" (Notation)
>
> "Try to be as specific as possible with the label, ideally avoiding single words like, "Uses"." (Notation)

Judge direction: "Sends receipts to" on an edge drawn from the email service to the API reads backwards.

### C4-08 One direction per line [measured: `flow.bidirectional`, `flow.undirected`]

> "Every line should represent a unidirectional relationship." (Notation)

### C4-09 Relationships between containers name their protocol [measured: `conventions.c4-relationship`]

> "Relationships between containers (typically these represent inter-process communication) should have a technology/protocol" (Notation)

## Meaning of the notation

### C4-10 Colors, shapes, borders and sizes mean something [judged]

> "Do you understand the meaning of all colours used?" / "Do you understand the meaning of all shapes used?" / "Do you understand the meaning of all border styles used? (e.g. solid, dashed, etc)" (Checklist)

Persons, internal containers and external systems keep distinct, consistent colors and shapes; if a color or shape carries meaning the legend cannot express, say so in the subtitle.

### C4-11 Arrowheads and line styles mean something [judged]

> "Do you understand the meaning of all arrow heads used?" / "Do you understand the meaning of all line styles used? (e.g. solid, dashed, etc)" (Checklist)
