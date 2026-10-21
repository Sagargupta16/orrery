---
description: Should not trigger. An AWS design question that needs no drawing.
tags: [trigger, trigger-negative]
expected_outcome: Claude answers without invoking orrery.
max_turns: 4
timeout_seconds: 180
allowed_tools: [Skill, Read, Glob, Grep]
---

What is the difference between Amazon SQS and SNS, and which one should an orders service use to tell three other services that an order was placed?
