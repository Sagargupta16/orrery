# orrery evals

Behavior evals for the orrery plugin, run with `claude plugin eval`: does the skill fire when it should, does a drawn diagram pass its own measurement, does `/orrery:draw` plan from the evidence without inventing anything, and does the review loop raise a bad diagram's score. Every grader is programmatic; none calls a judge model.

The format follows the Claude Code docs: [Test plugins with evals](https://code.claude.com/docs/en/plugin-evals.md) (case layout, `prompt.md` and `case.yaml` fields, grader types, the no-plugin baseline, the result JSON) and the [`plugin eval` command reference](https://code.claude.com/docs/en/plugins/cli-reference.md). `claude plugin eval` has no custom-code graders, so where a check needs the CLI, the prompt has orrery write its own output (the review JSON, the rendered files) and a `regex` grader reads that file, while a `tool_used` grader proves the command ran. The scripts in [scripts/](scripts/) run the same checks against the bundled CLI after a run, for an exact verdict.

## Suites

| Suite | Cases | Measures | Graders |
| --- | --- | --- | --- |
| `trigger/` | 5 should fire, 4 should not | The skill's description picks the right requests: architecture, system design, compose, CI/CD and Kubernetes diagrams fire it; a bar chart, an SQS vs SNS question, a Terraform module and a compose healthcheck bug do not | `tool_used: Skill` matching `orrery` or any `orrery:` command; the negatives use `min: 0, max: 0, arm: both` |
| `draw/` | AWS serverless API, Google Cloud web app | A diagram drawn from a description validates, renders to SVG and PNG, and passes `orrery review` at 880 px | `file_exists` for the spec, `tool_used: Bash` for `validate`, `regex` over the created files for the renders, `regex` over `docs/architecture.review.json` for width 880, score 85 or more and `pass: true` (weight 3) |
| `plan/` | Terraform serverless API, docker-compose app | `/orrery:draw` on a fixture repo: the planner's plan names every service and flow in the answer key, draws pulls in the data's direction, leaves IAM out and reads no flow from `depends_on` | `tool_used: Agent` for `orrery:planner`, one `regex` per required node and per required edge over `plan.json` (so the score is a node and edge recall), `not_contains` for invented services and the `depends_on` trap, `regex` for the confirm list |
| `review-loop/` | the deliberately bad spec | The review loop raises the measured score of [fixtures/bad-spec](fixtures/bad-spec/repo/docs/architecture.yaml) (70.9 at 880 px, failing, every hard count 0) with no hard count up and no node removed | `tool_used: Bash` for `review` and `patch`, `regex` over `out/final.review.json` for a score of 71.0 or more (weight 3) and all hard counts 0, `regex` over the spec for all nine node ids |

Fixtures live in [fixtures/](fixtures/). Each plan fixture has a `repo/` folder, which the case's `scaffold.sh` copies into the empty run workspace, and an `expected.json` answer key that stays behind, since a run cannot read the eval directory. The keys list the required nodes (with the resources and files that are evidence for them), optional nodes, actors, glue resources that must not become nodes, allowed boundaries, required and forbidden edges, and the pass thresholds.

## Run

Needs Claude Code 2.1.269 or later and git 2.31 or later. Every run is real model calls on your account. Cases that grant `Bash` run it under Claude Code's OS sandbox, which native Windows lacks: run `draw/` and `review-loop/` on macOS, Linux (with `bubblewrap` and `socat`) or WSL2. `trigger/` and `plan/` grant no shell and run anywhere.

First the free self-test, which needs no model and no Claude Code:

```bash
node evals/scripts/selftest.mjs
```

It lints every case against the documented format, runs each case's own graders over hand-made good and bad workspaces (built with the real CLI wherever a grader reads CLI output) and checks that good passes every grader and bad fails exactly the expected ones, then runs the three scripts below on good and bad inputs. It also re-measures the bad-spec fixture, so a scorer change that moves its 70.9 baseline fails here, and in CI, which runs it too, before it skews `review-loop/`.

Then, from the repository root (put the target before `--tag`, `--allow-tools` and `--json`):

```bash
# Triggering, with the no-plugin baseline: the delta is what the description adds.
claude plugin eval . --tag trigger

# Drawing and the review loop: the baseline cannot run the CLI, so skip it.
claude plugin eval . --tag draw --ablation none --keep-temp --max-cost-usd 10 --allow-tools Write Edit Bash
claude plugin eval . --tag review-loop --scaffold --ablation none --keep-temp --max-cost-usd 10 --allow-tools Write Edit Bash

# Planning from a fixture repo: --scaffold copies the fixture in.
claude plugin eval . --tag plan --scaffold --ablation none --keep-temp --allow-tools Write
```

`--scaffold` runs the case's `scaffold.sh` as you; the scripts here only copy a folder from `fixtures/`. For CI, add `--trust-plugin --json results.json --threshold 0.8 --no-publish`, pin `--model`, and gate on the exit code (0 pass, 1 a case under the threshold or a load error, 2 partial). Results go to `evals/results/<timestamp>/` (`aggregate-result.json` and `report.html`), which is git-ignored.

## Exact grading after a run

`--keep-temp` keeps each run's workspace and prints its path. The scripts re-measure what the run left there with the bundled CLI and print a JSON verdict (exit 0 pass, 1 fail):

```bash
# draw/: validate has no errors and the review at 880 passes, measured now rather than read from the run's JSON
node evals/scripts/check-spec.mjs <workspace>/docs/architecture.yaml --width 880

# plan/: node and edge recall, invented nodes and boundaries, glue, forbidden flows
node evals/scripts/plan-recall.mjs <workspace>/plan.json --expected evals/fixtures/serverless-api/expected.json
node evals/scripts/plan-recall.mjs <workspace>/plan.json --expected evals/fixtures/compose-app/expected.json

# review-loop/: the ratchet from loop.md, before against after
node evals/scripts/review-delta.mjs evals/fixtures/bad-spec/repo/docs/architecture.yaml <workspace>/docs/architecture.yaml
```

`plan-recall.mjs` matches a plan node to a key node by its evidence first (`infra/main.tf:46` resolves to the Terraform block or compose service on that line, or a resource address such as `aws_sqs_queue.order_events`), then by icon plus label, so it scores plans whose ids the planner chose itself. The in-run edge graders cannot: they match the node ids the prompt asks for (the Terraform resource names, the compose service names), so a plan that ignores that request loses its edge points in the run but can still pass `plan-recall.mjs`.

## Reading the scores

A run's score is the weighted share of its graders that passed; a case's score is the mean of its runs (3 by default). `tool_used: Skill` and graders marked `arm: with-only` count only as indicators in a two-arm run, unless they are a case's only graders, as in the `trigger/` positives, which then score 0 without the plugin. In the result JSON, read `aggregates.overallScore`, `aggregates.casesPassed` against `aggregates.casesTotal`, `cases[].aggregates.score` and, for `trigger/`, `cases[].aggregates.delta`.

## Limits

- `claude plugin eval` has no validate or dry-run mode. A run whose `--case` filter matches nothing still parses every case's `prompt.md` frontmatter and reports bad keys, but checks `case.yaml` and graders only when the case runs; `selftest.mjs` lints those.
- The docs do not say how a `not_contains` grader scores a file the run never wrote. If it passes, a plan run that wrote no `plan.json` still collects the `not_contains` points, while `plan-saved` and every node and edge grader fail.
- A diagram that uses a library icon set (`logos:`, `si:`, `tabler:`, `ph:`, `github:`, `ibm:`) loads it from `node_modules`, the user cache or a CDN, which the sandbox may block; the `draw/` cases use AWS and Google Cloud, whose packs ship with the skill.
- Changing the bad-spec fixture or the scorer moves the 70.9 baseline: update `score-raised` in [review-loop/review-raises-score/case.yaml](review-loop/review-raises-score/case.yaml), `BAD_SPEC_SCORE` in [scripts/selftest.mjs](scripts/selftest.mjs) and this page together.
