# Delhi Census Twin

Census 2011–grounded synthetic population for NCT Delhi, with archetype-clustered LLM polling. A TypeScript/Next.js port of the [simfrancisco](https://github.com/) prediction engine — without the Rust map/sim layer.

## Stack

- Next.js App Router + Route Handlers
- Prisma + PostgreSQL (external)
- LangChain / LangGraph + GitHub Models (OpenAI-compatible API)
- Vitest

## Setup

```bash
cd delhi-twin
cp .env.example .env
# Set DATABASE_URL and GITHUB_TOKEN (PAT with models:read)
npm install
npx prisma db push
npm run dev
```

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/cities` | List cities (Delhi) |
| POST | `/api/populations` | Generate synthetic population `{ n, seed }` |
| GET | `/api/populations/:id/demographics` | Weighted demographic breakdown |
| POST | `/api/polls/parse` | Parse free-text question |
| POST | `/api/polls/run` | Run weighted poll |
| POST | `/api/counterfactuals/run` | Before/after event poll |
| POST | `/api/validate` | Marginal fit or rubric validation |

## Data

Census 2011 marginals live under `data/census/`. The map image is `public/assets/Delhi.png`.

```bash
npm run ingest:census
```

That updates `delhi-nct.json` from the CSV and keeps district / SC / education / language / migrant tables that the state-level CSV does not include. Synthetic residents are built via hierarchical IPF + conditional assignment — not real microdata.

## Tests

```bash
npm test
npm run build
```

Acceptance: N=2,000 population matches constrained Census marginals within TV ≤ 0.05; mocked polls are deterministic.

## Notes

- Demographics reflect **Census 2011** (India has no newer published micro-marginals).
- Religion at ward level is model-assigned from district C-01 shares.
- Income is omitted (no Census counterpart in v1).
