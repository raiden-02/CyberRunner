# One-shot vs iterative evaluation

Held-out comparison of the frozen one-shot designer and the frozen evaluator-grounded iterative agent.

Reproducibility: manifest `arena-forge-p4-v1`.

## Experiment contract

- Manifest: `arena-forge-p4-v1`
- Manifest hash: `6acb4b3274ec7d1bb06090f5342816737227a9855945558958bc3d29154282e2`
- Arms: one_shot (P2 `runOneShotDesign`), agent (P3 `runAgentDesign`)
- Same starting ArenaMap, brief, P0 evaluator, Search & Destroy mode, six P1 actions, max 8 edits, model alias `gpt-5.6`
- 5 held-out cases × 2 arms × 2 replicates = 20 runs
- Scoring is local and deterministic. No second model. No prompt changes after the first held-out request.

## Method limitation

P2 returns one structured proposal. P3 makes repeated function-tool decisions. The formats are different, so this suite does not isolate a pure causal effect of evaluator feedback. It compares the two frozen design modes under the same map, model, action surface, evaluator, brief, and edit budget.

Model sampling is not bit-for-bit reproducible. The two replicates are a small robustness check. Fixtures, evaluator, and scoring are deterministic.

Historical P2/P3 smoke runs are development evidence only. They are not in these headline numbers.

## Cases

| Case | Split | Constraints |
| --- | --- | --- |
| `p4-blocked-spawn` | held_out | no_hard_failures; spawn_valid ghost-spawn-1; spawn_valid spawn-1; all_sd_paths_reachable |
| `p4-disconnected-route` | held_out | no_hard_failures; path_reachable sentinel-spawn-0 → objective-A; path_reachable sentinel-spawn-0 → objective-B; all_sd_paths_reachable |
| `p4-exposed-los` | held_out | no_hard_failures; los_blocked ghost-spawn-0 → sentinel-spawn-0; all_sd_paths_reachable |
| `p4-route-cover` | held_out | no_hard_failures; all_sd_paths_reachable; aggregate_median_at_most ghost → objective-B ≤ 21 |
| `p4-coupled-fault` | held_out | no_hard_failures; all_sd_paths_reachable; los_blocked ghost-spawn-0 → sentinel-spawn-0 |

## Aggregate

| Metric | one_shot (P2) | agent (P3) |
| --- | --- | --- |
| Constraint satisfaction | 34 / 34 (100.0%) | 34 / 34 (100.0%) |
| Zero-hard-failure runs | 10 / 10 | 10 / 10 |
| Completed | 10 / 10 | 10 / 10 |
| Invalid model output | 0 | 0 |
| Action rejected (run status) | 0 | 0 |
| Budget exhausted | 0 | 0 |
| Model error | 0 | 0 |
| Median successful edits | 1 | 1 |
| Median total tokens | 3484 | 8618 |
| Median latency (ms) | 8601 | 6727 |
| Feedback-responsive yes / no / unclear | n/a | 0 / 10 / 0 |

Requested model alias: `gpt-5.6`. Returned identifiers: `gpt-5.6-sol`.
Returned model identifiers did not split across materially different aliases in this recording.
Infrastructure retries: none.

## Per-case paired outcomes

| Case | P2 satisfied | P3 satisfied | Winner |
| --- | --- | --- | --- |
| `p4-blocked-spawn` | 8 / 8 | 8 / 8 | tie |
| `p4-disconnected-route` | 8 / 8 | 8 / 8 | tie |
| `p4-exposed-los` | 6 / 6 | 6 / 6 | tie |
| `p4-route-cover` | 6 / 6 | 6 / 6 | tie |
| `p4-coupled-fault` | 6 / 6 | 6 / 6 | tie |

### Replicate grid

#### `p4-blocked-spawn`

- one_shot r1: 4/4  completed  hard=0  edits=1  ok no_hard_failures; ok spawn_valid ghost-spawn-1; ok spawn_valid spawn-1; ok all_sd_paths_reachable
- one_shot r2: 4/4  completed  hard=0  edits=1  ok no_hard_failures; ok spawn_valid ghost-spawn-1; ok spawn_valid spawn-1; ok all_sd_paths_reachable
- agent r1: 4/4  completed  hard=0  edits=1  ok no_hard_failures; ok spawn_valid ghost-spawn-1; ok spawn_valid spawn-1; ok all_sd_paths_reachable
- agent r2: 4/4  completed  hard=0  edits=1  ok no_hard_failures; ok spawn_valid ghost-spawn-1; ok spawn_valid spawn-1; ok all_sd_paths_reachable

#### `p4-disconnected-route`

- one_shot r1: 4/4  completed  hard=0  edits=1  ok no_hard_failures; ok path_reachable sentinel-spawn-0 → objective-A; ok path_reachable sentinel-spawn-0 → objective-B; ok all_sd_paths_reachable
- one_shot r2: 4/4  completed  hard=0  edits=1  ok no_hard_failures; ok path_reachable sentinel-spawn-0 → objective-A; ok path_reachable sentinel-spawn-0 → objective-B; ok all_sd_paths_reachable
- agent r1: 4/4  completed  hard=0  edits=1  ok no_hard_failures; ok path_reachable sentinel-spawn-0 → objective-A; ok path_reachable sentinel-spawn-0 → objective-B; ok all_sd_paths_reachable
- agent r2: 4/4  completed  hard=0  edits=1  ok no_hard_failures; ok path_reachable sentinel-spawn-0 → objective-A; ok path_reachable sentinel-spawn-0 → objective-B; ok all_sd_paths_reachable

#### `p4-exposed-los`

- one_shot r1: 3/3  completed  hard=0  edits=1  ok no_hard_failures; ok los_blocked ghost-spawn-0 → sentinel-spawn-0; ok all_sd_paths_reachable
- one_shot r2: 3/3  completed  hard=0  edits=1  ok no_hard_failures; ok los_blocked ghost-spawn-0 → sentinel-spawn-0; ok all_sd_paths_reachable
- agent r1: 3/3  completed  hard=0  edits=1  ok no_hard_failures; ok los_blocked ghost-spawn-0 → sentinel-spawn-0; ok all_sd_paths_reachable
- agent r2: 3/3  completed  hard=0  edits=1  ok no_hard_failures; ok los_blocked ghost-spawn-0 → sentinel-spawn-0; ok all_sd_paths_reachable

#### `p4-route-cover`

- one_shot r1: 3/3  completed  hard=0  edits=1  ok no_hard_failures; ok all_sd_paths_reachable; ok aggregate_median_at_most ghost → objective-B ≤ 21
- one_shot r2: 3/3  completed  hard=0  edits=1  ok no_hard_failures; ok all_sd_paths_reachable; ok aggregate_median_at_most ghost → objective-B ≤ 21
- agent r1: 3/3  completed  hard=0  edits=1  ok no_hard_failures; ok all_sd_paths_reachable; ok aggregate_median_at_most ghost → objective-B ≤ 21
- agent r2: 3/3  completed  hard=0  edits=1  ok no_hard_failures; ok all_sd_paths_reachable; ok aggregate_median_at_most ghost → objective-B ≤ 21

#### `p4-coupled-fault`

- one_shot r1: 3/3  completed  hard=0  edits=1  ok no_hard_failures; ok all_sd_paths_reachable; ok los_blocked ghost-spawn-0 → sentinel-spawn-0
- one_shot r2: 3/3  completed  hard=0  edits=2  ok no_hard_failures; ok all_sd_paths_reachable; ok los_blocked ghost-spawn-0 → sentinel-spawn-0
- agent r1: 3/3  completed  hard=0  edits=1  ok no_hard_failures; ok all_sd_paths_reachable; ok los_blocked ghost-spawn-0 → sentinel-spawn-0
- agent r2: 3/3  completed  hard=0  edits=1  ok no_hard_failures; ok all_sd_paths_reachable; ok los_blocked ghost-spawn-0 → sentinel-spawn-0

## Feedback-responsive revision

No held-out P3 run had a clear action → evaluator fact → later compensating action chain.

## Cases P3 won / P2 won

- P3 better: none
- P2 better: none

## Verdict

**FAIL**

- P3 satisfaction 100.0% vs P2 100.0% (delta 0.0 pp)
- P3 hard-failure runs 0, P2 0
- case winners: agent 0, one_shot 0, tie 5
- feedback-responsive yes=0 no=10 unclear=0
- P3 aggregate constraint satisfaction is equal or worse than P2
- no held-out P3 run had clear feedback-responsive revision

## Portfolio claim supported by this evidence

ArenaForge is a bounded tool-using level-design experiment with deterministic evaluation and traceable revisions.

## Arms and budget

Both arms used `gpt-5.6`, Search & Destroy, the six P1 edit actions, and max edit budget 8 (P2 `MAX_ONE_SHOT_ACTIONS`, P3 `MAX_AGENT_EDIT_ATTEMPTS`).
Replicates per case per arm: 2.
