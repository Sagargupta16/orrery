---
description: Should trigger. A data model with entities and relationships.
tags: [trigger, trigger-positive]
expected_outcome: Claude invokes the orrery skill.
max_turns: 4
timeout_seconds: 180
allowed_tools: [Skill, Read, Glob, Grep]
---

Draw the data model for our blog for the README: users write posts, posts have many comments by users, and posts and tags are many to many through a post_tags table. Show the primary and foreign keys.
