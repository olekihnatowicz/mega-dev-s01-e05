# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
(next) a morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
pnpm test              # vitest
```

Working on it with an agent: start at [AGENTS.md](AGENTS.md).

## Host

The agents that wake alone (the pulse, the test writer) run on a host with a public https
address, not on your machine. Any host works: a free Cloudflare Worker is enough. What the course
sends them and what they send back: [docs/course-api.md](docs/course-api.md).

## Model credential

Agents that run on a host need a model key in that host's secrets. Any vendor works.

No paid plan? A free Google AI Studio key works through its OpenAI-compatible endpoint
(`https://generativelanguage.googleapis.com/v1beta/openai`). Use `gemini-flash-latest` for the agent that
writes tests (smaller models write weaker tests) and `gemini-flash-lite-latest` for the rest:
`gemini-flash-latest` runs dry at about 20 calls a day, and every agent in this repo shares the one key.
The live quota is on the key's page in AI Studio.

## Course agents

The service exposes `GET /.well-known/mega-pulse.json` for its owner and agent permissions, and
`POST /ping` for signed course pings. Deploy the repository root on Node.js 22 or newer and register
the public HTTPS URL ending in `/ping` with the course. Set `OWNER_CODE`, `PING_KEY`, and
`MODEL_API_KEY` as host secrets; never commit them. `MODEL_BASE_URL`, `PULSE_MODEL`, and `TEST_MODEL`
can select an OpenAI-compatible provider and separate models. The pulse reads `plan.md`, completed
plans, and the live course tracker; the test writer returns one test file without changing source.
