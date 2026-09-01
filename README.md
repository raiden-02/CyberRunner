# CyberRunner

A browser multiplayer FPS. The server owns movement and hits. ArenaForge is a level-design agent that edits a map you can then play in the same runtime.

**Play:** [game.cyberrunnergame.dev](https://game.cyberrunnergame.dev)

Guest play works. Two tabs can share a Deathmatch with the 6-letter HUD code.

![Netcode architecture](.github/architecture.svg)

## What this is

The server runs movement and hits at a fixed 60 Hz RAPIER tick. The client predicts locally, reconciles on each ack, and fires through a bounded rewind window.

ArenaForge edits real map geometry with a small tool set. A deterministic checker covers navigation, spawns, and line of sight. A seeded scripted playtest can show route and timing effects before the agent revises. The result launches into Search & Destroy.

## Gameplay

- Public map: Shoot House Neon
- Deathmatch: first to 5 kills, 10 minutes
- Search & Destroy: 3 lives, first to 3 rounds, spike plant and defuse
- Eight weapons, hitscan and projectile
- Crouch, prone, slide, sprint
- Quick Play and hosted rooms

`map-contract-smoke` is an internal fixture. It is not in the Create Game picker.

## ArenaForge

Open Arena Forge in the lobby. The recorded run is already there. Watch the timeline, then Play Result. No model key.

To run live design on your machine, put an OpenAI or Anthropic key on the server. See [`docs/arena-forge-live.md`](docs/arena-forge-live.md). The public site keeps live design off unless you turn it on with sign-in and daily caps.

The recorded numbers used OpenAI. Both providers can run live. That is not a claim they produce the same maps.

Both designers solved the simple repair cases (blocked spawn, broken routes) in one edit. A harder suite, where a useful edit can break something else, did not show the iterative designer winning overall. The recorded live session queried the playtest, overcorrected, then revised.

Numbers: [`server/arena-forge-evaluation.md`](server/arena-forge-evaluation.md), [`server/arena-forge-evaluation-p4b.md`](server/arena-forge-evaluation-p4b.md), [`server/arena-forge-playtest.md`](server/arena-forge-playtest.md).

The camera flythrough is presentation only. The scripted playtest is an offline navigation proxy, not bots in a live room.

## Networking

1. Client samples input on a 60 Hz tick and assigns a unique seq.
2. Local RAPIER applies that command and stores a controller snapshot.
3. The same command is sent as a 15-byte `input_bin`.
4. Server queues it (max 24), applies one command per sim tick, writes `PlayerState`, acks `lastProcessedInputSeq`.
5. Client restores the snapshot for that ack, applies the server pose, replays leftovers once, then smooths the camera.

Firing uses a 13-byte `fire_bin`. Shot origin comes from rewind history (RTT/2 plus 1.5 ticks, capped at 250 ms). Aim is client-originated and sanitized. Shared `CharacterController`, capsule, and shoot-house colliders live in `shared/`.

## Measured results

From `npm run benchmark` on 2026-08-29 (Node v23.11.0, Windows, i9-14900KF). Raw file: [`benchmarks/latest.json`](benchmarks/latest.json). Method: [`benchmarks/README.md`](benchmarks/README.md).

These are local synthetic numbers, not a production load test.

| Item | Value | Kind |
|------|-------|------|
| `INPUT_CMD` size | 15 bytes | measured (`encodeInputCmd`) |
| `FIRE_CMD` size | 13 bytes | measured (`encodeFireCmd`) |
| 60 Hz input payload | 900 B/s | calculated from 15 × 60 |
| Pending inputs at 0 / 50 / 100 / 150 ms | 0 / 3 / 6 / 9 ticks | synthetic local prediction harness |
| Tick time, 1 / 4 / 8 capsules | mean 0.017 / 0.054 / 0.151 ms | synthetic local RAPIER only |

**F3** in a match, or `debug.overlay()` in the console, shows RTT, seq/ack, pending replay, and predicted vs server pose.

## Run locally

```bash
npm install
npm test
npm run dev:server    # ws://localhost:2567
npm run dev:client    # http://localhost:5173
```

```bash
npm run build
npm run preview
```

Copy `server/.env.example` to `server/.env` only if you want auth, a database, or live Forge. Guest play works without that.

Live Forge setup: [`docs/arena-forge-live.md`](docs/arena-forge-live.md). `npm run forge:doctor` checks configuration without calling a model.

Production (Caddy, systemd, Postgres): [`server/DEPLOY.md`](server/DEPLOY.md).

## Tech

| Layer | Choice |
|-------|--------|
| Render | Three.js |
| Physics | RAPIER 3D (WASM), client and server |
| Rooms | Colyseus schema sync plus binary `input_bin` / `fire_bin` |
| Server | Node.js, Express, optional Postgres + Google OAuth |
| Client build | Vite + TypeScript |
| Hosting | DigitalOcean, Caddy (HTTPS), systemd |
| Live Forge | OpenAI or Anthropic, server-side only |

## Limitations

- Single-region rooms. Default cap is 8 players.
- Remotes use chase-latest lerp, not a delayed snapshot buffer.
- Client prediction does not collide with other players.
- Hitscan rewinds. Projectiles use current poses.
- Aim direction is client-trusted after a sanity check.
- ArenaForge V1 generates Search & Destroy variants only.
- Live design is one active job per process.

The source is public to read. It is not open source. See `LICENSE`. Shipped media: [`ASSETS.md`](ASSETS.md).
