# ArenaForge P5 playtest

Seeded scripted-playtest proxy for ArenaForge. Offline design analysis. Not a GameRoom bot, not human play, not combat AI, not a balance score.

## What it measures

On the current `ArenaMap` it rolls paired Ghost/Sentinel runners and reports:

- site choice counts
- median arrival seconds per site
- mean route-exposure fraction
- route concentration
- first-contact time and a 2 m hotspot

These are environment observations. They are not a claim about fun or competitive balance.

P0 still answers static geometry, nav, spawn, and LOS. Playtest answers what scripted runners do when those facts are executed over time.

## What it does not do

- jump, crouch, slide, sprint, shoot, recoil, damage, abilities
- learned policies or tactical AI
- mutate the input map
- let the model pick seed or rollout count

Standing-ground P0 nav still applies.

## Constants

| Name | Value | Meaning |
| --- | --- | --- |
| `PLAYTEST_SEED` | `20260831` | LCG seed. Same map + seed + rollouts is byte-stable JSON. |
| `PLAYTEST_ROLLOUTS` | `64` | One Ghost + one Sentinel per rollout. |
| Speed | `MOVE.WalkMaxSpeed` (`5.0` m/s) | Shared ordinary walk. No sprint. |
| `EXPOSURE_PENALTY_METERS` | `12` | Added as `12 * exposureFraction` to route utility. |
| `EXPLORATION_JITTER_METERS` | `2.5` | Seeded uniform `[0, 2.5]` so close utilities mix. |

PRNG is a 32-bit LCG: `state = (imul(state, 1664525) + 1013904223) >>> 0`. No `Math.random()`.

## Heuristic and metrics

Site utility (lower wins):

```text
travel meters + 12 * exposureFraction + uniform(0, 2.5)
```

Exposure: fraction of chosen-route cells with clear eye-height LOS from one or more opposing spawn anchors. Limitation: anchors are spawn points, not live defenders.

Route concentration: max fraction of that role's successful rollouts that visited the same non-spawn nav cell. Not a balance score.

First contact: walk both routes at 5 m/s, 0.05 s steps, until the earlier arrival. First clear eye-height LOS. Location is the midpoint. No firing.

If a site is unused, its median arrival is omitted. Reports contain no NaN or Infinity.

## Agent

P5 is a new loop. Frozen P2/P3 prompts and tools are untouched.

Tools: the six P1 edits, `run_playtest`, `finish_design`.

`run_playtest` is read-only. It always uses seed `20260831` and 64 rollouts so before/after reports are paired. The model chooses when to query. Edits still apply P1 then return a fresh P0 inspection.

Budgets:

- 8 edit attempts
- 3 playtest calls
- 12 model decisions (8 + 3 + 1 finish)

A fourth playtest is not executed. No silent fallback to static-only feedback.

## CLI

```bash
npx tsx --tsconfig server/tsconfig.json server/scripts/arena-forge-playtest.ts --map=map-contract-smoke
npx tsx --tsconfig server/tsconfig.json server/scripts/arena-forge-playtest.ts --map=map-contract-smoke --json
npx tsx --tsconfig server/tsconfig.json server/scripts/arena-forge-playtest-demo.ts
```

The demo adds east B cover at `(6, 2, -2)` hx=4 hz=1.2 on smoke.

P0 stays `hard 0`, paths `12/12` both sides.

Playtest on the same seed/rollouts:

| Metric | Before | After |
| --- | --- | --- |
| Ghost site A / B | 23% / 77% | 67% / 33% |
| Ghost median arrival B | 2.4 s | 3.3 s |
| Ghost mean exposure | 0.755 | 0.643 |
| First-contact occurrence | 59% | 36% |
| First-contact hotspot | x=5.25 z=-1.25 | x=-4.5 z=-1.5 |

## Not a benchmark

P5 is not compared to P2/P3 here. No held-out suite.

P4-A hash: `6acb4b3274ec7d1bb06090f5342816737227a9855945558958bc3d29154282e2`

P4-B hash: `0ad49258552c067ebf1117dacc37b0c02ce16505870e943ef33e60ef571faa39`

## One live development session

Dev map: `map-contract-smoke`. One OpenAI call sequence. Not a held-out eval.

Brief:

```text
Use playtest evidence to reduce Ghosts' strong preference for site B
so scripted traffic is less one-sided. Keep both sites reachable.
Avoid new hard failures and avoid opening ghost-spawn-0 to
sentinel-spawn-0 LOS.
```

Requested model `gpt-5.6`, returned `gpt-5.6-sol`. Status `completed`.

Trajectory:

1. `run_playtest` baseline. Ghost A/B 15/49. Exposure 0.755. Contact 59% at x=5.25 z=-1.25.
2. `add_solid` occluder at (-5.5, 1.5, -3.5) hx=2 hz=0.4. Id `occluder-1`. P0 hard 0.
3. `run_playtest` same seed. Ghost A/B 44/20. Concentration 0.438 → 0.688. Overcorrected.
4. `resize_solid` `occluder-1` hx 2 → 1.2. P0 hard 0.
5. `run_playtest` same seed. Ghost A/B 30/34. Exposure 0.635. Concentration 0.469.
6. `finish_design`.

The model did call `run_playtest` (3/3 budget). Edits 2/2. Model calls 6/12. Tokens 56572. Latency 29550 ms.

Final solid: `occluder-1` at (-5.5, 1.5, -3.5) hx=1.2 hy=1.5 hz=0.4.

P0 stayed 0 hard failures and both sites reachable. `ghost-spawn-0` → `sentinel-spawn-0` was clear on the source map and is now blocked by `occluder-1`. The brief said do not open that LOS. The model closed it.

This is not a claim that P5 beats P2 or P3. It shows the agent can query the simulator, edit, and compare paired reports.

## Forge workbench (P6)

The lobby Forge screen runs this same P5 agent behind `POST /api/arena-forge/design`. Jobs are in-memory only. They disappear on server restart. At most one live job at a time.

Live design is off unless `ARENA_FORGE_LIVE_AGENT_ENABLED=true` and a server-side `OPENAI_API_KEY` exist. The API never tells the client whether a key is present, only `liveAgentAvailable`.

A sanitized copy of the development run lives at `server/fixtures/arena-forge/p5-demo.json`. Load it from Forge as **Recorded P5 demo**. No API key required.

Same-seed playtest reports are deterministic. Pairing is strongest while the valid spawn and route sets stay the same. The simulator was not changed to address that.
