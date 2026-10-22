# Conventions rubric: data models (entity-relationship diagrams)

Applies when the spec says `kind: er`. Sources, quoted verbatim:

- The PostgreSQL Global Development Group, *PostgreSQL Documentation*, chapter 5.5 "Constraints": <https://www.postgresql.org/docs/current/ddl-constraints.html> (PostgreSQL below, with the section).
- Mermaid, *Entity Relationship Diagrams*: <https://mermaid.js.org/syntax/entityRelationshipDiagram.html> (Mermaid below), for crow's foot (Information Engineering) notation as READMEs draw it.

**[measured]** rules are checked by `orrery review` (finding id given); do not re-report them. **[judged]** rules are yours: report a violation with the rule id, its quote and the spec ids. **[renderer]** rules are applied by orrery and cannot be fixed from the spec; do not report them.

How orrery carries a data model: each node with `fields:` is a table (an entity), one row per field written `"name type [pk] [fk] [unique] [null]"`; each edge is a relationship, drawn as a plain line (`--`, or `---` dashed) from the key a row is looked up by to the foreign key that holds it, with `card: "A:B"` giving each end (`1`, `0..1`, `1..n` or `n`, `0..n` or `*`) and `from_field` / `to_field` naming the rows it joins when the names do not say. A relationship has no direction, so a line without an arrowhead is the notation, not a defect.

## Entities and keys

### ER-01 Entities follow one naming convention [judged]

> "This is why entities are always named using singular nouns." (Mermaid, Entities and Relationships)

A logical model names each entity for one instance of what it holds (Customer, Order). A physical model drawn from a schema keeps the table names as the schema writes them (`customers`, `order_items`), so a reader can find each one in the code; either way, one convention for the whole figure. Flag a mix (`Customer` beside `order_items`, `orders` beside `payment`), and a name that does not say what a row is (`data`, `items2`, `tbl_main`). Patch: `set nodes.<id>.label`.

### ER-02 Columns say what they hold; the figure shows the ones that matter [judged]

A table lists its key, the foreign keys that carry its relationships and the columns that say what a row means; audit columns repeated on every table (`created_by`, `updated_at`), internal flags and long tails of attributes go, or the figure stops reading at README width (ER-12). Types are the schema's own (`uuid`, `timestamptz`, `numeric(10,2)`), written the same way on every table. Flag a table over about ten rows, a foreign key without its `fk` flag (the line then has no row to say what it joins), and a type spelled two ways (`int` and `integer`).

### ER-03 Every table has a primary key [measured: `conventions.er-primary-key`]

> "A primary key constraint indicates that a column, or group of columns, can be used as a unique identifier for rows in the table." (PostgreSQL 5.5.4)
>
> "A table can have at most one primary key." (PostgreSQL 5.5.4)

A join table's key is usually the pair of its foreign keys (`order_id uuid pk fk`, `product_id uuid pk fk`). Judge the choice too: a composite key of three or more columns, or a natural key that changes (an email as the key of `users`), is worth a sentence in the note.

### ER-04 Every foreign key is drawn as its relationship [measured: `conventions.er-dangling-fk`]

> "A foreign key constraint specifies that the values in a column (or a group of columns) must match the values appearing in some row of another table." (PostgreSQL 5.5.5)

The measurement finds an `fk` row no relationship lands on. When the table it references belongs to another figure (ER-11), say so in the table's `note` (`customer_id: see Accounts`) instead of drawing a line to nothing. Judge that each line lands on the right rows: the key on one end, the foreign key on the other; a line from `orders.customer_id` to `customers.email` joins on a column no constraint names.

## Relationships

### ER-05 Both ends say how many [measured: `conventions.er-cardinality`]

> "In each cardinality marker there are two characters. The outermost character represents a maximum value, and the innermost character represents a minimum value." (Mermaid, Relationship Syntax)
>
> "A not-null constraint simply specifies that a column must not assume the null value." (PostgreSQL 5.5.2)

The measurement finds a relationship with no `card:`. Judge that the ends agree with the columns: a foreign key marked `null` puts `0..1` on the referenced end (an order may have no coupon), a `NOT NULL` one puts `1` there; a foreign key that is also `unique` (or the child's whole primary key) puts `0..1` on the child's end, one row at most per parent; otherwise the child's end is `0..n`, or `1..n` only where the model requires at least one child (an order with no items is not an order).

### ER-06 Lines meet the rows they join [renderer]

orrery seats each end on the side of its table at the center line of the row it joins (the foreign key that names the other table, the key on the other end, or the rows `from_field` and `to_field` name), straight out for the marks, and lines tables up so the joined rows share a line where a small move allows it. A line on a table's header means neither end names a row: that is ER-04's or ER-02's finding (a missing `fk` flag, a column named for something else), not a drawing defect.

### ER-07 Every entity takes part [measured: `conventions.er-orphan`]

A table on the figure with no relationship either belongs on another figure (ER-11) or is missing the foreign key that ties it in. A lookup table (countries, currencies) referenced from several subject areas may stand alone on an overview figure when its note says where it is used.

### ER-08 Many to many goes through a join entity [measured: `conventions.er-many-to-many`]

> "Say you have tables about products and orders, but now you want to allow one order to contain possibly many products" (PostgreSQL 5.5.5, which answers with an `order_items` table keyed by both foreign keys)

The measurement finds a line with a many end on both sides. A conceptual model may draw one before the tables exist; a model of a schema draws the join table, with its own columns (quantity, role, sort order) when it has them, and two one-to-many lines into it.

### ER-09 Labels read from the first entity [judged]

> "relationship-label describes the relationship from the perspective of the first entity." (Mermaid, Relationship Syntax)

A label is a verb phrase that reads left to right along the line as written: `customers -- orders: places` reads "a customer places orders". Flag a label that repeats a table name (`customer orders`), a label on only some lines of a figure that labels others, and two lines out of one table with the same label.

### ER-10 Solid and dashed mean identifying and non-identifying [judged]

> "Relationships may be classified as either identifying or non-identifying and these are rendered with either solid or dashed lines respectively." (Mermaid, Relationship Syntax)

A child whose key includes the parent's key (a join table, `order_items` keyed by `order_id`) is identified by it: a solid line. A child that only refers to the parent (`orders.customer_id`) may be drawn dashed. Flag a figure that mixes the two styles without a `legend:` saying which is which; one style throughout needs no legend.

## The figure

### ER-11 One subject area per figure [judged]

A figure shows one subject area (ordering, billing, publishing), about four to eight tables, each with the relationships among them. A schema of thirty tables is several figures, each one's foreign keys into the others named in notes (ER-04), and an overview with only the tables and lines, no fields. Flag a figure over ten tables, and lines that cross most of the figure to reach a table that belongs to another area.

### ER-12 Readable at README width [judged; text size measured: `quality.label-size`]

At 880px three columns of tables read well; four shrink row text under the size a reader can use. Flag a figure the review shows below scale 0.8, with the fix in this order: drop columns (ER-02), split the subject area (ER-11), then `direction: down`. Rows of the joined tables lined up in reading order (parents left of the tables that point at them, a join table between the two it joins) keep lines short and straight: patch with `move` in the nodes list or `rank` on a table.
