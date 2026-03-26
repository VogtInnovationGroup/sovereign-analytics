# Sovereign Analytics — Project Instructions

## What This Is

Self-hosted, privacy-first web analytics. Deploys on Vercel (free tier) + Turso (free SQLite). Zero cost, complete data ownership. No cookies, no PII, anonymous session tracking, bot filtering, GeoIP via Vercel headers.

This is a **library/template** — copy `src/` into your Next.js project, not a standalone app.

Stack: Next.js (App Router) + TypeScript + Turso (libSQL) + ua-parser-js.

## Architecture

### Three-Layer Pipeline
1. **Browser → Server**: `AnalyticsScript.tsx` sends events via `navigator.sendBeacon` (non-blocking). Anonymous UUID per tab (`sessionStorage`), UTM extraction, scroll depth tracking, 30s heartbeat intervals.
2. **Server → Database**: API routes validate, filter bots, parse device/browser/OS server-side, extract GeoIP from `x-vercel-ip-country`, insert to Turso.
3. **Database → Dashboard**: `/api/analytics/stats` runs 23 parallel SQL queries. Standalone `dashboard/index.html` fetches JSON, renders charts in pure JS.

### Dual Storage
- **Turso mode**: When `TURSO_DATABASE_URL` set, persists to remote SQLite
- **In-memory fallback**: No env var = tracks up to 10k views + 5k events in memory (dev mode)

### Privacy by Design
- No cookies. Session ID = `crypto.randomUUID()` in `sessionStorage` (dies with tab)
- Consent-aware: checks `hasConsented()` before tracking
- Bot filtering: discards "bot", "crawler", "spider", "headless" user-agents
- Duration capped at 1800s, scroll at 100%

## Directory Structure

- `src/app/api/analytics/route.ts` — POST page view (validation, bot filter, GeoIP, insert)
- `src/app/api/analytics/heartbeat/route.ts` — POST time-on-page + scroll depth updates
- `src/app/api/analytics/event/route.ts` — POST custom events (CTA clicks, outbound links)
- `src/app/api/analytics/stats/route.ts` — GET aggregated stats (Bearer token auth)
- `src/app/api/analytics/export/route.ts` — GET CSV/JSON export (Bearer token auth)
- `src/components/AnalyticsScript.tsx` — Client component: session mgmt, page/scroll/outbound tracking
- `src/lib/store.ts` — Data layer: Turso queries + in-memory fallback, 23 aggregation queries (354 lines)
- `src/lib/cors.ts` — CORS headers (allows file:// dashboard)
- `src/lib/consent.ts` — localStorage-based consent utility
- `src/types.ts` — TypeScript interfaces for all event types & stats
- `dashboard/index.html` — Standalone HTML dashboard (625 lines), pure JS, auto-refresh 60s
- `examples/next.config.ts` — Recommended security headers & CORS config

## Integration

```tsx
// In your Next.js layout.tsx:
import AnalyticsScript from "@/components/AnalyticsScript";
// Inside <body>:
<Suspense><AnalyticsScript /></Suspense>
```

## Environment Variables

```bash
TURSO_DATABASE_URL=libsql://your-db.turso.io  # omit for in-memory dev mode
TURSO_AUTH_TOKEN=<token>
ANALYTICS_KEY=<random-hex-string>              # Bearer token for stats/export endpoints
```

## Dashboard

Open `dashboard/index.html` directly in browser (or serve via `npx serve dashboard -l 3099`). Enter your site URL and ANALYTICS_KEY. Auto-refreshes every 60s.

## Current State

Production-ready. MIT licensed (Vogt Innovation Group). Schema version: `page_views_v3`. No tests included. Full TypeScript coverage.
