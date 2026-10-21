---
description: Should trigger. A README architecture request in plain words, no skill named.
tags: [trigger, trigger-positive]
expected_outcome: Claude invokes the orrery skill.
max_turns: 4
timeout_seconds: 180
allowed_tools: [Skill, Read, Glob, Grep]
---

I need an architecture diagram for our README. Users load a React app from CloudFront backed by an S3 bucket, and /api calls go through API Gateway to a Lambda function that reads and writes a DynamoDB table. Dark theme is fine.
