---
description: Should not trigger. Debugging a docker-compose file, not drawing it.
tags: [trigger, trigger-negative]
expected_outcome: Claude answers without invoking orrery.
max_turns: 4
timeout_seconds: 180
allowed_tools: [Skill, Read, Glob, Grep]
---

My docker-compose Postgres healthcheck never turns healthy. Here is the service, what is wrong with it?

```yaml
  db:
    image: postgres:17
    environment:
      POSTGRES_PASSWORD: example
    healthcheck:
      test: ["CMD", "pg_isready -U postgres"]
      interval: 5s
      retries: 5
```
