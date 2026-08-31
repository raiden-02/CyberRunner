# Interaction evaluation

Revision stress suite. Separate from the basic-repair evaluation.

Reproducibility: manifest `arena-forge-p4b-v1`.

The basic-repair suite scored 34/34 (100%) on both arms. Almost every iterative run was one edit then finish, so it did not test evaluator-grounded revision.

This suite asks: when an edit that helps a target can change a guardrail, does the iterative agent recover or refine better than one-shot?

## P4-A (do not mix into P4-B percents)

- basic recovery
- P2 100%
- P3 100%

## Contract

- Manifest: `arena-forge-p4b-v1`
- Hash: `0ad49258552c067ebf1117dacc37b0c02ce16505870e943ef33e60ef571faa39`
- Arms: frozen `runOneShotDesign` vs frozen `runAgentDesign`
- Model alias: `gpt-5.6`
- 5 cases × 2 arms × 2 replicates = 20 runs
- P2 is one structured proposal. P3 is sequential function calls. This is not a pure causal test of feedback.

## Cases

| Case | Targets | Guardrails |
| --- | --- | --- |
| `p4b-route-opens-los` | aggregate_median_at_most ghost → objective-A ≤ 18 | no_hard_failures; all_sd_paths_reachable; los_blocked ghost-spawn-0 → sentinel-spawn-0 |
| `p4b-cover-hurts-nav` | los_blocked ghost-spawn-0 → sentinel-spawn-0 | no_hard_failures; all_sd_paths_reachable; aggregate_median_at_most ghost → objective-A ≤ 16 |
| `p4b-shared-ab` | aggregate_median_at_most ghost → objective-A ≤ 18 | no_hard_failures; all_sd_paths_reachable; aggregate_median_at_most ghost → objective-B ≤ 16 |
| `p4b-gap-vs-los` | all_sd_paths_reachable | los_blocked ghost-spawn-0 → sentinel-spawn-0 |
| `p4b-multi-coupled` | all_sd_paths_reachable; aggregate_median_at_most ghost → objective-A ≤ 18 | los_blocked ghost-spawn-0 → sentinel-spawn-0; aggregate_median_at_most ghost → objective-B ≤ 16 |

## Aggregate

| Metric | one_shot (P2) | agent (P3) |
| --- | --- | --- |
| Overall constraints | 32/36 (88.9%) | 31/36 (86.1%) |
| Targets | 8/12 | 7/12 |
| Guardrails | 24/24 | 24/24 |
| Zero-hard-failure runs | 10/10 | 10/10 |
| Completed | 10/10 | 10/10 |
| Invalid / rejected / budget / error | 0/0/0/0 | 0/0/0/0 |
| Median successful edits | 1 | 1 |
| Median tokens | 3835 | 9033 |
| Median latency ms | 14172 | 8315 |
| Feedback yes/no/unclear | n/a | 1/9/0 |
| Regression recovery yes/no | n/a | 0/10 |

Returned models: `gpt-5.6-sol`

## Per-case

| Case | P2 | P3 | Targets P2/P3 | Guardrails P2/P3 | Winner |
| --- | --- | --- | --- | --- | --- |
| `p4b-route-opens-los` | 6/8 | 6/8 | 0/2 / 0/2 | 6/6 / 6/6 | tie |
| `p4b-cover-hurts-nav` | 8/8 | 8/8 | 2/2 / 2/2 | 6/6 / 6/6 | tie |
| `p4b-shared-ab` | 6/8 | 7/8 | 0/2 / 1/2 | 6/6 / 6/6 | agent |
| `p4b-gap-vs-los` | 4/4 | 4/4 | 2/2 / 2/2 | 2/2 / 2/2 | tie |
| `p4b-multi-coupled` | 8/8 | 6/8 | 4/4 / 2/4 | 4/4 / 4/4 | one_shot |

### Replicate grid

#### `p4b-route-opens-los`

- one_shot r1: 3/4  target 0/1  guard 3/3  completed  edits=1
- one_shot r2: 3/4  target 0/1  guard 3/3  completed  edits=1
- agent r1: 3/4  target 0/1  guard 3/3  completed  edits=1
- agent r2: 3/4  target 0/1  guard 3/3  completed  edits=1

#### `p4b-cover-hurts-nav`

- one_shot r1: 4/4  target 1/1  guard 3/3  completed  edits=1
- one_shot r2: 4/4  target 1/1  guard 3/3  completed  edits=1
- agent r1: 4/4  target 1/1  guard 3/3  completed  edits=1
- agent r2: 4/4  target 1/1  guard 3/3  completed  edits=1

#### `p4b-shared-ab`

- one_shot r1: 3/4  target 0/1  guard 3/3  completed  edits=1
- one_shot r2: 3/4  target 0/1  guard 3/3  completed  edits=1
- agent r1: 3/4  target 0/1  guard 3/3  completed  edits=1
- agent r2: 4/4  target 1/1  guard 3/3  completed  edits=2

#### `p4b-gap-vs-los`

- one_shot r1: 2/2  target 1/1  guard 1/1  completed  edits=1
- one_shot r2: 2/2  target 1/1  guard 1/1  completed  edits=1
- agent r1: 2/2  target 1/1  guard 1/1  completed  edits=1
- agent r2: 2/2  target 1/1  guard 1/1  completed  edits=1

#### `p4b-multi-coupled`

- one_shot r1: 4/4  target 2/2  guard 2/2  completed  edits=4
- one_shot r2: 4/4  target 2/2  guard 2/2  completed  edits=4
- agent r1: 3/4  target 1/2  guard 2/2  completed  edits=1
- agent r2: 3/4  target 1/2  guard 2/2  completed  edits=3

## Feedback-responsive traces

- `p4b-shared-ab` r2: turn 1 created/changed obstacle-2; turn 2 resize_solid targets obstacle-2

## Regression-recovery traces

No held-out P3 run restored a guardrail or hard-failure regression after a later edit.

## Winners

- P3 better: `p4b-shared-ab`
- P2 better: `p4b-multi-coupled`

## Verdict

**MIXED**

- P3 overall 86.1% vs P2 88.9% (delta -2.8 pp)
- targets P3 7/12 vs P2 8/12
- guardrails P3 24/24 vs P2 24/24
- case winners: agent 1, one_shot 1, tie 3
- feedback-responsive yes=1  regression-recovery yes=0
- hard-failure runs P3 0, P2 0
- feedback-responsive revision appeared, but the quantitative STRONG PASS gate was not met

## Portfolio claim

ArenaForge is a bounded tool-using level-design agent that uses deterministic gameplay evaluation to inspect and revise map edits.
