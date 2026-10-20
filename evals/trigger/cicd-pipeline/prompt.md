---
description: Should trigger. A CI/CD pipeline diagram across GitHub and AWS.
tags: [trigger, trigger-positive]
expected_outcome: Claude invokes the orrery skill.
max_turns: 4
timeout_seconds: 180
allowed_tools: [Skill, Read, Glob, Grep]
---

Make a CI/CD pipeline diagram for the docs: a push to GitHub triggers GitHub Actions, which builds a container image and pushes it to Amazon ECR, and then Argo CD syncs it to our EKS cluster.
