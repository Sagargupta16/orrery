---
description: Should trigger. Turning a docker-compose file into a diagram.
tags: [trigger, trigger-positive]
expected_outcome: Claude invokes the orrery skill.
max_turns: 4
timeout_seconds: 180
allowed_tools: [Skill, Read, Glob, Grep]
---

Turn this docker-compose file into a diagram with proper logos for the docs:

```yaml
services:
  web:
    image: nginx:1.27-alpine
    ports: ["80:80"]
  app:
    build: ./app
    environment:
      DATABASE_URL: postgres://app@db:5432/app
      REDIS_URL: redis://cache:6379
  db:
    image: postgres:17
  cache:
    image: redis:7.4-alpine
```
