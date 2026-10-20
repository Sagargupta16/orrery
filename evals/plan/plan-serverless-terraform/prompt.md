---
description: /orrery:draw on a small Terraform serverless API; the planner's plan must find every service and flow and invent nothing.
tags: [plan]
expected_outcome: plan.json shows API Gateway, both Lambdas, DynamoDB, SQS and S3 with the five flows, pulls drawn queue to function, no IAM nodes, no edge read from depends_on.
max_turns: 20
timeout_seconds: 900
allowed_tools: [Skill, Read, Glob, Grep, Agent, TodoWrite, Write]
---

/orrery:draw the architecture of this repository for its README at 880 px. Use the Terraform resource names as node ids so each box traces back to its resource. When you show me the confirm list, also save the plan JSON to plan.json; I will confirm before you write the spec.
