# MetroLens roadmap

**Status: planning.** Nothing below is built yet. This document describes the intended product; milestones are marked here as they land.

## What it is
MetroLens is an AI analyst for US metro housing and migration data, covering every US metropolitan area (about 390 MSAs, keyed by Census CBSA code). Ask "Is Phoenix cooling faster than Tampa?" and an agent pulls the numbers through tools, searches source documents, draws a chart, and answers with citations plus a cost and latency footer. The same tools are exposed as an MCP server, so Claude Desktop or any MCP client can query the data directly.

All housing data comes from publicly available sources (FHFA, BLS, Census, FRED) and is pulled by MetroLens's own ingestion job. Every stored number carries its source, the period it describes and the date it was retrieved. Each source's licence and required attribution is recorded in `docs/data-sources.md`; a source is only ingested if its terms allow redistribution. Related production site: [sunbeltpulse.com](https://sunbeltpulse.com).

## Goals
- One framework-free TypeScript core, three thin adapters: REST, a tool-calling agent, and an MCP server.
- Answers grounded in tool results and cited sources, never in model memory.
- Measurable AI quality and cost: an eval suite that gates CI, and per-request token and cost tracking.
- Production habits from day one: CI/CD, infrastructure as code, tracing, error tracking, accessibility and Core Web Vitals budgets.

## Data coverage
| Metric | Source | Coverage | Frequency | Planned for |
|---|---|---|---|---|
| House price index | FHFA HPI, all-transactions (bulk CSV) | all metros; the largest are reported by metropolitan division | quarterly | launch |
| Unemployment | BLS LAUS (bulk files) | all metros | monthly | launch |
| 10-year Treasury yield | Federal Reserve H.15, via FRED | national | weekly | launch |
| 30-year mortgage rate | Freddie Mac survey, via FRED (MORTGAGE30US) | national | weekly | when permission is granted |
| Building permits | Census Building Permits Survey | all metros | monthly | after launch |
| Net migration, population | Census Population Estimates | all metros | yearly | after launch |
| Median gross rent | Census ACS 1-year | metros above 65k population; no standard 2020 estimates | yearly | after launch |

The mortgage rate series is Freddie Mac's survey as republished by FRED, and Freddie Mac's terms restrict redistribution. Until written permission is granted, the national rate at launch is the 10-year Treasury yield, a US government series that mortgage rates track closely, and it is always labelled as a Treasury yield, not a mortgage rate.

**Geography.** Sources do not share one clean metro list, so MetroLens fixes its own:
- Metros follow one pinned OMB delineation (the 2023 definitions), keyed by CBSA code. A crosswalk maps codes from older vintages in historical files.
- FHFA reports the largest metros by metropolitan division and publishes no figure for the metro as a whole. Divisions are stored as child geographies of their metro. A request for the metro returns its principal division by default, with a visible note, and the other divisions on request. MetroLens never computes a metro value the source did not publish.
- Missing data is reported as missing, never filled in. FHFA leaves a quarter blank when a metro has too few transactions.

Frequencies differ, so every observation stores its period and retrieval date, and the UI and agent always say which period a number belongs to.

## Features
**Must have at launch**
1. Metro dashboard: all US metros with search, preset metro sets ("Sun Belt 12" is the default), the three launch metrics, trend charts, compare 2 to 3 metros, and rankings.
2. Ask the analyst: streaming chat; the agent calls tools, shows which tools it used, renders charts inline and cites sources.
3. Tools shared by the agent and MCP: `list_metros(set?, state?, query?)`, `get_metric_series(metro, metric, from, to, transform?)`, `compare_metros(metros, metric, period)`, `rank_metros(metric, period, set?, limit)`, `search_sources(query)` (RAG), `build_chart(spec)`.
4. MCP server: the same tools plus resources (`metro://{cbsa}`, `catalog://metrics`, `sets://{name}`) and a `metro-briefing` prompt, over stdio locally and Streamable HTTP with OAuth 2.1 remotely.
5. Evals: about 25 golden questions with expected numbers and tools, run on pull requests that touch prompts, tools or models, failing the build under 90%.
6. Cost and latency: tokens, cost and time on each answer; an `/ops` page with daily totals, p50/p95 latency and eval history.
7. Auth: anonymous demo mode with a rate limit, plus GitHub sign-in for a higher daily budget. A global daily spend cap sits above both.
8. Live deploy, README, design doc and ADRs.

**After launch**
- The remaining metrics: building permits, net migration and population, median rent.
- Saved conversations for signed-in users.
- Eval set grown to about 40 cases.

**Stretch**
- Model routing: a small model for tool selection and a larger one for the final answer, compared in the eval report.
- MCP Apps for `build_chart`: return the interactive chart itself to MCP clients that support it.
- The in-app agent calling its own `/mcp` endpoint as an MCP client, behind a flag.
- Kubernetes manifests and a `kind` setup in `deploy/k8s`.
- Scheduled "watch this metric" alerts.

**Out of scope:** user-uploaded data, multi-tenant orgs, mobile app, fine-tuning.

## Stack
- **Monorepo:** pnpm workspaces + Turborepo, TypeScript strict, shared ESLint and tsconfig.
- **Frontend:** React 19, Vite, TanStack Query, Chart.js (react-chartjs-2), CSS-variable design tokens, Storybook, Vitest + Testing Library, Playwright, axe-core, Lighthouse CI.
- **API:** Node (the current LTS line, pinned in the repo), NestJS, Zod 4, Drizzle ORM + `pg`, Vitest + Testcontainers.
- **AI:** Claude via `@anthropic-ai/sdk`; embeddings in Postgres with pgvector.
- **MCP:** the official TypeScript MCP SDK, served by the API over HTTP and by a small stdio package. The SDK major version and target spec revision are pinned in ADR-004.
- **Data:** Postgres with pgvector (Neon in production, Docker locally).
- **Infra:** Docker; Terraform (azurerm) for Azure Container Apps, Container Registry, Key Vault and Static Web Apps; GitHub Actions with OIDC to Azure.
- **Observability:** OpenTelemetry traces for every request, tool call and model call (token counts as span attributes) exported to Honeycomb; Sentry for frontend and API errors.

## Architecture
```
React SPA ──HTTPS/SSE──▶  apps/api (NestJS)
                            │  REST endpoints  ─┐
                            │  Agent endpoint   ├─▶ packages/core (one query
Claude Desktop ─stdio──▶ apps/mcp-stdio (local) │     handler per tool, each
Any MCP client ─HTTP──▶  /mcp (Streamable HTTP)─┘     with a Zod contract)
                            │                            │
                            ▼                            ▼
                     Anthropic API              packages/db: Drizzle ─▶ Postgres + pgvector
                     (agent loop)               apps/ingestion (FHFA, BLS, Census, FRED) all MSAs
```
**Layout:** `packages/core` (domain and application: Geography, Metric, Observation, query handlers, Zod tool contracts; no framework imports, enforced by lint) · `packages/db` (Drizzle schema, repositories, embeddings) · `packages/ui` (design system, Storybook) · `packages/evals` (runner) · `apps/api` (NestJS: REST, auth, agent endpoint, `/mcp`) · `apps/web` (React) · `apps/mcp-stdio` · `apps/ingestion`.

**Core idea:** every tool is a query handler in the core, defined once as a Zod schema. REST validation, the Claude tool definition, the MCP tool schema and the frontend types all derive from it, so validation and telemetry are written once and MCP is just another adapter.

**Handlers:** core query handlers are plain classes with a Zod contract. NestJS injects them as ordinary providers; the eval runner constructs them directly. There is no command/query bus (see ADR-001).

**Local MCP package:** `apps/mcp-stdio` runs the same core handlers, but a user's machine has no database. Its repository ports are implemented over HTTP against the public REST API instead of Postgres.

**Data model:** metrics differ in frequency (weekly, monthly, quarterly, annual) and geography (metro or national), and the schema says so explicitly. A metric catalog records each metric's unit, frequency, geography level and source. Observations are keyed by metric, geography and period start, and store the value, source and retrieval date. National series are stored once, not per metro. Tool results always carry the frequency and a period label, and handlers never resample silently.

**Derived numbers:** the model does no arithmetic. `compare_metros` returns computed changes (absolute, percent, year over year) and ranks; `get_metric_series` accepts a transform (level, year-over-year percent, indexed to start).

**Agent loop:** system prompt + tool definitions → model requests tools → API runs them through the core handlers → results return → final answer streamed over SSE as structured parts (text, chart spec, citations). Limits: max 6 tool rounds, max tokens per request, per-user daily budget, global daily spend cap. Every step is a trace span.

## MCP design
- **Transports:** stdio (`npx @bjamesbc/metrolens-mcp`) and Streamable HTTP at `/mcp` on the API.
- **Tools:** the six above, each with a JSON schema, model-oriented descriptions and read-only annotations. All housing data is publicly available and read-only.
- **Charts:** `build_chart` takes a spec that references series (metro, metric, range, transform); the server fills in the data, so the model never supplies chart numbers. The web app renders the spec. Over MCP the tool returns the validated spec plus the resolved data as a table.
- **Resources:** `metro://{cbsa}` (latest snapshot), `sets://{name}` (named metro sets such as `sun-belt-12`), `catalog://metrics` (definitions, units, source, cadence).
- **Prompt:** `metro-briefing(metro)` for a one-page market briefing built from the tools.
- **Auth:** OAuth 2.1 per the MCP authorization spec. A hosted authorization server handles sign-in (GitHub as the login), client registration and token issuance. The API is the resource server only: it publishes its protected-resource metadata and validates each token's signature, audience and expiry. The same service handles sign-in for the web app. Rate limits apply on top (see ADR-004).
- **Tests:** contract tests that list and call every tool through an MCP client.

## Evals and cost
- `evals/golden.yaml`: about 25 cases at launch, each with a question, expected tools, expected numbers (with tolerance) and required sources. Covers single-metro lookups, comparisons, trends, "not in the data" cases, and prompt-injection attempts inside source documents.
- Data: evals run against a pinned, dated snapshot of the observations, not the live database, so source revisions cannot break golden answers. Refreshing the snapshot is a deliberate PR.
- Graders: numeric check, tool-call match, citation check, and an LLM judge only for tone and completeness. An injection case passes when the answer ignores the planted instruction and still cites correctly.
- CI: runs on pull requests from branches of this repository that touch prompts, tools or models; pull requests from forks skip the evals because they cannot read the API key. Posts pass rate, cost and p95 latency as a PR comment; fails under 90%. A failing case is retried once, and a case that passes only on retry is reported as flaky.
- Cost: input, output and cached tokens plus cost per request, stored in Postgres and on the trace span. Prompt caching for the system prompt and tool definitions, with the saving reported and a test that asserts cache reads actually happen.
- Spend protection, outermost first: a monthly limit on the Anthropic workspace; a global daily cap, after which the agent declines until 00:00 UTC while the dashboard and MCP tools keep working; per-user daily limits (lower for anonymous visitors); per-request limits on tool rounds and tokens. A kill switch disables the agent without a deploy.

## Privacy
The housing data is public, but the app stores a small amount of personal data: a GitHub account identifier for signed-in users, and usage counters for rate limits and budgets (keyed by a hashed IP address for anonymous visitors). A privacy note with retention and deletion terms ships with sign-in.

## Milestones
**1. Walking skeleton.**
- Monorepo and layout, Docker Compose, CI (install, build, typecheck, lint, test).
- A spike proving one Zod schema can produce the REST validation, the Claude tool definition and the MCP tool schema.
- Geography reference table for all MSAs with divisions and the crosswalk; "Sun Belt 12" as the first metro set.
- Ingestion for the three launch metrics from bulk files, run by hand. `docs/data-sources.md` with licence and attribution per source.
- `ListMetros`, `GetMetricSeries` and `CompareMetros` with tests, and REST endpoints over them.
- React shell with tokens, metro search and one chart.
- One-time manual bootstrap (Terraform state storage, the deploy identity for GitHub OIDC), then Terraform for Container Apps, Container Registry, Static Web Apps and Key Vault, deploying from main. Live on the default Azure hostnames first; the custom domains `metrolens.sunbeltpulse.com` and `api.metrolens.sunbeltpulse.com` follow as a separate slice.
- ADR-001 (clean core + NestJS adapters), ADR-002 (Azure Container Apps + Terraform), ADR-006 (data model and geography).

**2. The agent.**
- Agent loop with tools, SSE streaming, structured answer parts, tool-use display.
- `RankMetros` and `BuildChart`, with inline charts.
- RAG over source documents (FHFA/BLS methodology pages, FOMC statements) with citations.
- OpenTelemetry end to end, Sentry, token and cost logging; the global daily cap and kill switch.
- Ingestion as a scheduled job.
- First 15 eval cases and the runner on a pinned snapshot. ADR-003 (pgvector over a dedicated vector DB).

**3. MCP, auth, evals in CI.**
- MCP server over the same handlers (stdio + Streamable HTTP) with resources, the prompt and contract tests; the stdio package published to npm.
- GitHub sign-in through the hosted authorization server; OAuth 2.1 on `/mcp`; anonymous and per-user limits.
- 25 eval cases gating CI with a PR comment.
- ADR-004 (MCP transport and auth), ADR-005 (eval strategy).

**4. Polish.**
- Dashboard compare and rankings views.
- Storybook for 8 to 10 components; accessibility audit (keyboard, screen reader, contrast, a data-table alternative for every chart).
- Lighthouse CI budgets for LCP (< 2.5 s), CLS (< 0.1) and Total Blocking Time. INP (< 200 ms) cannot be measured in a lab run, so it is measured from real visits.
- First-visit experience: the API and database both sleep when idle, so add a keep-warm check, explicit loading states, and cached example answers for when the daily cap is reached.
- `/ops` page. Playwright e2e for 3 flows. Design doc and README.

**5. After launch.** Permits, net migration and population, and median rent ingestion; saved conversations; eval set to about 40 cases.

Scope rule: must-haves before stretch items; main deploys continuously from milestone 1.
