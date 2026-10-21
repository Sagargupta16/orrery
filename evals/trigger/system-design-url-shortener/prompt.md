---
description: Should trigger. A system design interview diagram with no cloud vendor.
tags: [trigger, trigger-positive]
expected_outcome: Claude invokes the orrery skill.
max_turns: 4
timeout_seconds: 180
allowed_tools: [Skill, Read, Glob, Grep]
---

Can you sketch a system design diagram of a URL shortener for my interview prep? A load balancer, a stateless app tier, a Redis cache in front of Postgres, and click analytics going through Kafka into a warehouse.
