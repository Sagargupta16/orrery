---
description: Draws a Google Cloud web app from a description; the spec must validate and pass the measured review at 880 px.
tags: [draw]
expected_outcome: docs/architecture.yaml validates with no errors, renders to SVG and PNG, and orrery review at 880 px passes.
max_turns: 60
timeout_seconds: 1800
allowed_tools: [Skill, Read, Glob, Grep, Agent, TodoWrite, Write, Edit, Bash]
---

Draw our Google Cloud web app for the docs and save the spec as docs/architecture.yaml. Users reach a global external Application Load Balancer, which routes to a Cloud Run service; the service reads and writes Cloud SQL for PostgreSQL and publishes jobs to Pub/Sub, and a second Cloud Run service subscribes and writes reports to Cloud Storage. Render SVG and PNG next to the spec. It is shown 880 px wide, so the diagram has to pass orrery review at that width; leave the last review JSON next to the spec.
