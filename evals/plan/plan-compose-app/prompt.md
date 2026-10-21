---
description: /orrery:draw on a small docker-compose app; the planner's plan must find every service and flow and invent nothing.
tags: [plan]
expected_outcome: plan.json shows proxy, api, worker, db and cache with the five flows from env vars, nginx.conf and the code, and no flow read from depends_on.
max_turns: 20
timeout_seconds: 900
allowed_tools: [Skill, Read, Glob, Grep, Agent, TodoWrite, Write]
---

/orrery:draw the architecture of this repository for its README at 880 px. Use the compose service names as node ids so each box traces back to its service. When you show me the confirm list, also save the plan JSON to plan.json; I will confirm before you write the spec.
