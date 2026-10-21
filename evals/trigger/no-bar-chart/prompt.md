---
description: Should not trigger. A data chart is not an architecture diagram.
tags: [trigger, trigger-negative]
expected_outcome: Claude answers without invoking orrery.
max_turns: 4
timeout_seconds: 180
allowed_tools: [Skill, Read, Glob, Grep]
---

Make a bar chart of our monthly signups for the team update: Jan 120, Feb 180, Mar 240, Apr 310. A matplotlib script is fine.
