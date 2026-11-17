---
description: Should trigger. A sequence diagram of messages between participants.
tags: [trigger, trigger-positive]
expected_outcome: Claude invokes the orrery skill.
max_turns: 4
timeout_seconds: 180
allowed_tools: [Skill, Read, Glob, Grep]
---

I want a sequence diagram of our login for the security review: the browser redirects to the auth server, the user signs in, the auth server redirects back with a code, our backend exchanges the code for tokens and then calls the user info endpoint.
