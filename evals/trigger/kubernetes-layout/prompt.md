---
description: Should trigger. A Kubernetes layout from a short description.
tags: [trigger, trigger-positive]
expected_outcome: Claude invokes the orrery skill.
max_turns: 4
timeout_seconds: 180
allowed_tools: [Skill, Read, Glob, Grep]
---

Draw how our app runs on Kubernetes: an Ingress in the shop namespace routes to a web Deployment and an api Deployment, and the api talks to a Postgres StatefulSet.
