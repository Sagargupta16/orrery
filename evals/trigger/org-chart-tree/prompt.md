---
description: Should trigger. An org chart, drawn as a tree.
tags: [trigger, trigger-positive]
expected_outcome: Claude invokes the orrery skill.
max_turns: 4
timeout_seconds: 180
allowed_tools: [Skill, Read, Glob, Grep]
---

Can you make an org chart for the team page? The CTO has three reports: the VP of Engineering, the Head of Data and the Head of Security. Two engineering managers report to the VP of Engineering, and each has a platform or product team under them.
