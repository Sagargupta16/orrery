---
description: Should trigger. A state machine of one thing's lifecycle.
tags: [trigger, trigger-positive]
expected_outcome: Claude invokes the orrery skill.
max_turns: 4
timeout_seconds: 180
allowed_tools: [Skill, Read, Glob, Grep]
---

Make a state machine diagram of a support ticket for the design doc: new, triaged, in progress, waiting on customer, resolved and closed, with the events that move it between them, including reopen from resolved.
