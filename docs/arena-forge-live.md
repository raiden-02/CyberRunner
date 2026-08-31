# ArenaForge live runs

The public site shows a recorded agent run with no model account. Live design is separate. It calls a server-side OpenAI or Anthropic API and can consume a lot of tokens.

Recorded evaluation evidence was produced with the OpenAI path. Live design has direct OpenAI and Anthropic session adapters. Those adapters share the same tools and prompt. They were not benchmarked against each other.

## Keys stay on the server

Provider credentials are server environment variables.

- Do not commit keys.
- Do not put them in `client/.env` or `client/.env.local`.
- Do not paste them into the browser or the Forge UI.
- There is no public bring-your-own-key form.

Official key handling:

- [OpenAI API key safety](https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety)
- [Anthropic API keys](https://docs.anthropic.com/en/api/getting-started)

## Local OpenAI

Copy `server/.env.example` to `server/.env` and set:

```env
ARENA_FORGE_ACCESS_MODE=self_host
ARENA_FORGE_LIVE_AGENT_ENABLED=true
ARENA_FORGE_PROVIDER=openai
OPENAI_API_KEY=...
ARENA_FORGE_MODEL=
```

`ARENA_FORGE_MODEL` is optional. Unset OpenAI uses `gpt-5.6`.

```bash
npm run forge:doctor
npm run dev:server
npm run dev:client
```

Open `http://localhost:5173`. Play as Guest → Arena Forge → Run your own design → Run live design.

The sample brief is already filled. Postgres and Google auth are not required for self-host live Forge.

## Local Anthropic

Same flow. Replace the provider and key:

```env
ARENA_FORGE_ACCESS_MODE=self_host
ARENA_FORGE_LIVE_AGENT_ENABLED=true
ARENA_FORGE_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
ARENA_FORGE_MODEL=
```

Unset Anthropic uses `claude-sonnet-5`. That is a current Sonnet-class model with custom tool use, not a quality claim versus OpenAI.

## Hosted vs self-host

Access mode decides who may call live design and whether quota applies. Provider decides which model API runs.

| Access mode | Auth | Quota | Use |
|---|---|---|---|
| `self_host` | none | none | localhost or a private trusted server |
| `hosted` | Google sign-in | Postgres daily caps | optional public live |

`self_host` means anyone who can reach this server's live-design endpoint can spend the configured model account. Do not use it on the public internet.

Hosted live also needs `DATABASE_URL`, Google sign-in, and daily caps. Recommended public production config:

```env
ARENA_FORGE_LIVE_AGENT_ENABLED=false
```

or leave the flag unset. Visitors still get the recorded run, timeline, Play Original, and Play Result.

## Check configuration

`npm run forge:doctor` uses the same policy as the server. It does not call OpenAI or Anthropic.

Typical failures:

- Live flag is disabled. `ARENA_FORGE_LIVE_AGENT_ENABLED` is not exactly `true`.
- Provider is openai but OPENAI_API_KEY is not configured.
- Provider is anthropic but ANTHROPIC_API_KEY is not configured.
- ARENA_FORGE_PROVIDER must be openai or anthropic.
- Hosted mode requires database-backed quota storage.

Changing provider or key requires a server restart. One process uses one provider. The UI reports it. Visitors cannot pick a provider.

Expected live status: queued → tool turns appear → completed or failed. The model will not necessarily reproduce the recorded run.
