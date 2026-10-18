# Conventions rubric: customer journey maps

Applies when the spec says `kind: journey`. Source, quoted verbatim:

- Nielsen Norman Group, *Journey Mapping 101* (2018, last reviewed 2026-07-15): <https://www.nngroup.com/articles/journey-mapping-101/> (NN/g below, with the section).

**[measured]** rules are checked by `orrery review` (finding id given); do not re-report them. **[judged]** rules are yours: report a violation with the rule id, its quote and the spec ids.

How orrery carries a journey: `stages:` are the columns in order, `type: lane` groups are the rows (actions, touchpoints, pain points, opportunities), every node names its `stage:`, and `score:` from -2 to 2 on the actor's steps draws the emotion curve. Links between rows are associations, so plain lines explained in the legend and unlabelled links between rows are not reported.

## Actor and scenario

### JM-01 One actor per map [judged]

> "Provide one point of view per map in order to build a strong, clear narrative." (NN/g, Actor)

Flag an actions row that mixes two actors (a customer step next to a support agent's step): the second actor gets their own map or their own row named for them. The title or subtitle names the actor ("A new customer's path").

### JM-02 The scenario and its goal are stated [judged]

> "The scenario describes the situation that the journey map addresses and is associated with an actor’s goal or need and specific expectations." (NN/g, Scenario + Expectations)

The title or subtitle says what the actor is trying to do ("from first search to the first renewal"). Patch: `set subtitle`.

## Stages and steps

### JM-03 Stages are the high-level phases [judged]

> "Journey phases are the different high-level stages in the journey. They provide organization for the rest of the information in the journey map (actions, thoughts, and emotions)." (NN/g, Journey Phases)

Stages are a handful of phases in time order named from the actor's side ("Discover, Sign up, Set up"); flag stages named for the company's departments or a stage that is a single click. Patch: `set stages`.

### JM-04 Every stage holds the actor's steps, and the steps carry emotion [measured: `conventions.journey-incomplete`]

> "Actions are the actual behaviors and steps taken by users." (NN/g, Actions, Mindsets, and Emotions)
>
> "Emotions are plotted as single line across the journey phases, literally signaling the emotional “ups” and “downs” of the experience." (NN/g, Actions, Mindsets, and Emotions)

The measurement reports a stage with no node and a journey with no `score:` anywhere. Judge whether the scores match the steps: a pain point in a stage whose steps score 2 contradicts itself.

### JM-05 Steps tell a narrative, not a click log [judged]

> "This component is not meant to be a granular step-by-step log of every discrete interaction. Rather, it is a narrative of the steps the actor takes during that phase." (NN/g, Actions, Mindsets, and Emotions)

Flag a stage with many small UI steps ("Clicks Next", "Clicks Save"); merge them into the step the actor would name.

## Takeaways

### JM-06 The map ends in opportunities [judged]

> "Opportunities (along with additional context such as ownership and metrics) are insights gained from mapping; they speak to how the user experience can be optimized." (NN/g, Opportunities)

A journey that shows pain points without an opportunities row stops before its point. Each opportunity sits in the stage of the pain it answers; flag one with no pain point or low score near it.
