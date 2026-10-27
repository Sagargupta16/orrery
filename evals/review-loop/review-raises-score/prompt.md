---
description: The review loop on a deliberately bad spec (score 70.9 at 880 px, fails); the final measured score must go up with no hard count up and no node removed.
tags: [review-loop]
expected_outcome: out/final.review.json, written by orrery review on the final spec, scores above 70.9 with every hard count at 0, and docs/architecture.yaml still has all nine nodes.
max_turns: 60
timeout_seconds: 1800
allowed_tools: [Skill, Read, Glob, Grep, Agent, TodoWrite, Write, Edit, Bash]
---

The architecture diagram in docs/architecture.yaml goes into our README, which is 880 px wide, and it looks cluttered. Review and improve it with the orrery review loop. When you are done, measure the final spec once more with orrery review at 880 px and write that review to out/final (so out/final.review.json holds the final score).
