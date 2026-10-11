---
name: Bug report
about: A diagram renders wrong, an icon is missing or wrong, the validator misses or misflags something, docs are wrong.
title: "bug: <short summary>"
labels: bug
---

## What's broken

<!-- Layout, an output format (SVG, PNG, draw.io, TSX, HTML), an icon, a group style, the validator, the skill guidance. One sentence. -->

## Expected vs actual

<!-- What should happen, what happens instead. The PNG or SVG helps most. -->

## Reproduction

1. Spec (paste the YAML, trimmed to the smallest one that shows it):
2. Command: `node skills/diagramify/scripts/diagramify.mjs render <spec> -f svg,png`
3. Output of `diagramify validate <spec> --json`:

## Environment

- `diagramify --version`:
- `node --version`:
- OS:
- Where it renders wrong (GitHub README, browser and version, draw.io, PowerPoint...):
