---
description: Should trigger. A flowchart of one procedure with decisions.
tags: [trigger, trigger-positive]
expected_outcome: Claude invokes the orrery skill.
max_turns: 4
timeout_seconds: 180
allowed_tools: [Skill, Read, Glob, Grep]
---

Draw a flowchart for our refund policy doc: a customer asks for a refund, we check whether the order is under 30 days old, if not we decline, if yes we check whether the amount is over 500 dollars, which needs a manager's approval, otherwise support refunds it right away.
