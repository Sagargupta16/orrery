---
description: Draws an AWS serverless API from a description; the spec must validate and pass the measured review at 880 px.
tags: [draw]
expected_outcome: docs/architecture.yaml validates with no errors, renders to SVG and PNG, and orrery review at 880 px passes.
max_turns: 60
timeout_seconds: 1800
allowed_tools: [Skill, Read, Glob, Grep, Agent, TodoWrite, Write, Edit, Bash]
---

Draw the architecture of our orders API for the README and save the spec as docs/architecture.yaml. Customers call an API Gateway HTTP API, which invokes a Lambda function that writes the order to DynamoDB and sends an event to SQS; a second Lambda polls the queue and stores a receipt in S3. Render SVG and PNG next to the spec. The README column is 880 px wide, so the diagram has to pass orrery review at that width; leave the last review JSON next to the spec.
