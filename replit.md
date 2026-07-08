# Reddit Research AI

A full-stack SaaS web app that converts Reddit discussions into structured founder-grade market research reports. Users bring their own LLM API keys (BYOK model) to run analyses using Reddit's public API and their choice of AI provider.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/reddit-research run dev` — run the frontend (port 18651)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` — auto-provisioned by Replit Clerk integration
- Optional env: `ENCRYPTION_KEY` — 64-char hex key for AES-256-GCM API key encryption; if unset, derived from SESSION_SECRET

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind v4, Wouter routing, TanStack Query
- Auth: Replit-managed Clerk (cookie-based for web)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Reddit data: Reddit public JSON API (no auth required)
- LLM: BYOK — supports 10 providers (OpenAI, Anthropic, Gemini, Perplexity, OpenRouter, Groq, Mistral, DeepSeek, Cohere, xAI)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contract)
- `lib/db/src/schema/reports.ts` — reports table schema
- `lib/db/src/schema/apiKeys.ts` — api_keys table schema
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/reddit.ts` — Reddit post/comment fetching
- `artifacts/api-server/src/lib/llm.ts` — multi-provider LLM generation
- `artifacts/api-server/src/lib/encryption.ts` — AES-256-GCM key encryption/decryption
- `artifacts/reddit-research/src/pages/` — React page components
- `artifacts/reddit-research/src/App.tsx` — Clerk + Wouter routing

## Architecture decisions

- **BYOK model**: API keys stored encrypted (AES-256-GCM) in DB; only the last-4-char preview is ever returned to the client. The `encryptedKey` column is never selected in list/get endpoints.
- **Async report generation**: POST /reports returns immediately with status=pending; background processing updates progress via DB polling. Frontend polls `/reports/:id/status` every 2s while running.
- **Reddit API**: Public JSON API with exponential backoff on 429s and bounded concurrency (3 posts at a time for comment fetching) to avoid rate limits.
- **LLM routing**: OpenAI SDK-compatible fetch for 7 providers; native REST calls for Anthropic, Gemini, Cohere. JSON extraction uses 3-stage fallback (direct parse → strip fences → find first `{...}`).
- **Clerk proxy**: Frontend uses `publishableKeyFromHost` to resolve the correct key; proxy URL is injected at deploy time via `VITE_CLERK_PROXY_URL`.

## Product

- **Landing page**: Dark "war room" aesthetic for indie founders/PMs. Hero, how-it-works, feature sections, mock report preview, FAQ.
- **Dashboard**: New report creation form with keyword + advanced options (subreddit, time range, max posts/comments, API key selector). Real-time progress indicator during generation.
- **Report viewer**: 11 structured sections — executive summary, sentiment gauge chart, pain points bar chart, feature requests, competitors table, customer personas, buying objections, opportunity gaps, key threads with links, actionable recommendations.
- **API Keys manager**: Add/validate/delete keys across 10 LLM providers. Keys validated before saving.
- **Saved Reports**: List, filter, delete, and re-run previous reports.

## User preferences

_Populate as needed._

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `lib/api-spec/openapi.yaml`.
- The API server rebuilds on restart (`dev` script: build then start) — restart takes ~5s.
- Clerk dev keys warning in browser console is expected and harmless in development.
- `ENCRYPTION_KEY` should be set in production to a 64-char hex string for proper key encryption.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `clerk-auth` skill for Clerk configuration and troubleshooting
