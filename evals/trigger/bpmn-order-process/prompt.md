---
description: Should trigger. A BPMN business process across pools and lanes.
tags: [trigger, trigger-positive]
expected_outcome: Claude invokes the orrery skill.
max_turns: 4
timeout_seconds: 180
allowed_tools: [Skill, Read, Glob, Grep]
---

I need a BPMN process diagram of order to cash for the ops wiki: the customer places an order, sales checks credit, the warehouse picks and ships, finance sends the invoice and records the payment. Show the customer as its own pool and our three teams as lanes.
