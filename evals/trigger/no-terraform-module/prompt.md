---
description: Should not trigger. Infrastructure code, not a diagram of it.
tags: [trigger, trigger-negative]
expected_outcome: Claude answers without invoking orrery.
max_turns: 4
timeout_seconds: 180
allowed_tools: [Skill, Read, Glob, Grep]
---

Write a Terraform module for an S3 bucket with versioning, server-side encryption and a lifecycle rule that moves objects to Glacier after 90 days.
