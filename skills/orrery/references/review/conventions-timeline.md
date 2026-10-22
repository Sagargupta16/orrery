# Conventions rubric: timelines and roadmaps

Applies when the spec says `kind: timeline`. Sources, paraphrased (follow the links for the wording):

- Nielsen Norman Group, Sarah Gibbons, *UX Roadmaps: Definition and Components* (2020-07-05): <https://www.nngroup.com/articles/ux-roadmaps/> (NN/g below).
- Wikipedia, *Gantt chart*: <https://en.wikipedia.org/wiki/Gantt_chart> (Gantt below), for the bar-chart conventions a dated plan follows: time across, one bar per task from start to finish, a line for today, links between dependent tasks.

**[measured]** rules are checked by `orrery review` (finding id given); do not re-report them. **[judged]** rules are yours: report a violation with the rule id, what the rule asks and the spec ids.

How orrery carries a timeline: `timeline: { scale, start, end, today }` sets the axis (one of `day`, `week`, `month`, `quarter`, `year`; the bounds padded to whole periods), each top-level group is a lane, items in no group share the first row, `start:` + `end:` draws a bar, `date:` a point, `milestone: true` a diamond, `status:` one of `done`, `active`, `planned`, `at-risk` sets the style, and every edge is a finish-to-start dependency drawn from the end of one item to the start of the next. The key under the lanes explains the statuses in use; labels sit inside a bar when they fit, beside it otherwise.

## The axis

### TL-01 Every item is on the axis [measured: `conventions.timeline-undated`]

A roadmap item without a date has no place in a dated plan (Gantt: each bar is placed by its start and finish). The measurement reports every node with neither `date:` nor `start:` and `end:`; such a node is left out of the picture. Patch: `set date` or `set start` and `set end` on it, or move it to an "Undated" list in the README text.

### TL-02 One scale per figure, chosen for the span [judged]

A figure reads at one granularity. Pick the scale whose columns the reader thinks in: weeks or months for a project plan of a few months, quarters for a year of product work, years for a release history. Flag a figure whose items are all much shorter than one column (a week-long task on a year axis) or that needs more than about 16 columns to cover its span (a two-year plan by month). Patch: `set timeline.scale`.

### TL-03 Items stay inside the axis bounds [measured: `conventions.timeline-range`]

When the spec sets `timeline.start` or `timeline.end`, an item that starts before or ends after them is cut off at the edge, which reads as a shorter item. Patch: widen the bound, or drop the item from this figure.

### TL-04 Today is marked on a plan that is in flight [judged]

NN/g asks a roadmap to say when it was last updated, and Gantt charts carry a line for the current date so readers see what is ahead or behind. A roadmap with `done` and `planned` items and no `timeline.today` leaves the reader guessing where now is. Patch: `set timeline.today` to the date the plan was last reviewed (a fixed date, so the picture does not change by itself).

## Lanes and items

### TL-05 Lanes are workstreams, teams or themes [judged]

NN/g organizes a roadmap by theme and names who does the work. Lanes group the items one team or workstream owns ("Platform", "Mobile", "Growth"); flag lanes named for statuses ("Done", "Next") or for single items, and a figure that puts everything in one lane when the items belong to clearly separate teams. Patch: `set in` on the items, or a new group.

### TL-06 Milestones mark decisions and deliveries [judged]

A diamond is a point in time something is decided or delivered (a launch, a go or no-go gate, a cutover). Flag a milestone that is really work with a duration (it should be a bar), and a span of work drawn as a point. Patch: `set milestone: true` on the decision; `set start`/`set end` on the work.

### TL-07 Planned work looks planned [measured in part: `conventions.timeline-legend`]

Later items are the least certain (NN/g: roadmaps are living documents and later work is expected to change). Work that has not started carries `status: planned`, finished work `done`, work underway `active`, and slipping work `at-risk`; the key under the lanes says what each style means. The measurement reports statuses drawn with no key entry. Judge the statuses against `timeline.today`: an item marked `done` that ends after today, or `planned` that ended long before it, contradicts the plan. Patch: `set status`.

### TL-08 Dependencies run forward in time [measured: `conventions.timeline-order`]

A finish-to-start dependency means the target cannot start before the source finishes. The measurement reports an edge whose target starts before its source ends: either the dates or the dependency is wrong. Patch: move the target's `start`, or drop the edge.

### TL-09 Few dependency arrows [judged]

Gantt notes that linked charts get cluttered quickly. Draw the dependencies that drive the schedule (the critical chain, the gate everything waits for), not every relationship; a figure with more arrows than lanes times two is usually showing too many. Patch: drop the edges that do not change a date.

## Reading at README width

### TL-10 About 20 items per figure, short labels [judged]

A roadmap read in a README column holds about 20 items; split a longer plan by lane or by half-year into separate figures (`views:`). Labels name the outcome or deliverable in two to four words ("Usage billing", "EU region"); detail goes into `note:`. NN/g asks for the audience's language: a feature code or ticket number is not a label.

### TL-11 Point labels do not pile up [measured: `conventions.timeline-crowded`]

Dates close together in one lane stack their labels into extra rows. The measurement reports a lane whose point labels stacked more than three deep. Patch: shorten the labels, move some points to another lane, or use a finer scale so they spread out.
