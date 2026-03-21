# Sovereign Analytics

**Self-hosted, privacy-first web analytics. Your data, your database, $0/month.**

---

## The Problem

Google Analytics is free because **you** are the product. Your visitors' data feeds Google's advertising machine, gets shared with third parties, and lives on servers you'll never control.

Privacy-focused alternatives like Plausible and Fathom are better — but they charge $9+/month for the privilege of *not* being surveilled.

## The Solution

Sovereign Analytics is a complete, production-grade analytics stack that runs on **free tiers** of Vercel and Turso. Zero cost. Zero third-party data sharing. And because Turso is built on SQLite, you can download your entire database as a `.db` file anytime — **your data never gets trapped**.

### What You Get

- **Page views** with device, browser, OS, screen size, viewport, and language detection
- **GeoIP** via Vercel headers (free, no third-party API needed)
- **Engagement tracking** — time on page and scroll depth via 30-second heartbeats
- **UTM campaign tracking** — source, medium, campaign, term, content
- **Outbound click tracking** — automatic, including mailto: and tel: links
- **Custom events** — track anything with a name + JSON properties
- **Entry/exit page analysis** — see where sessions start and end
- **Bounce rate, pages/session, new vs. returning** — real metrics, not vanity counts
- **Real-time visitor count** — who's on your site right now
- **Local dashboard** — standalone HTML file, no server needed, auto-refreshes every 60 seconds
- **CSV/JSON export** — download your raw data anytime
- **Consent-aware** — respects cookie preferences out of the box
- **Bot filtering** — ignores crawlers, spiders, and headless browsers
- **In-memory fallback** — works in local dev without a database

### What It Costs

| Component | Free Tier |
|-----------|-----------|
| Vercel | 100GB bandwidth, serverless functions |
| Turso | 9GB storage, 500M rows read/month |
| **Total** | **$0/month** |

This covers most sites up to ~100K monthly page views. After that, Turso's paid tier starts at $29/month for 24GB — still cheaper than every hosted analytics product.

---

## Quick Start (5 Minutes)

### 1. Create a Turso Database

```bash
# Install the Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Sign up (free) and create a database
turso auth signup
turso db create my-analytics
turso db tokens create my-analytics
```

Save the database URL and auth token — you'll need them in step 3.

### 2. Copy the Files Into Your Next.js Project

```
your-project/
├── src/
│   ├── lib/
│   │   ├── store.ts        ← from src/lib/store.ts
│   │   ├── cors.ts         ← from src/lib/cors.ts
│   │   └── consent.ts      ← from src/lib/consent.ts
│   ├── app/api/analytics/
│   │   ├── route.ts        ← page view endpoint
│   │   ├── heartbeat/route.ts
│   │   ├── stats/route.ts
│   │   ├── export/route.ts
│   │   └── event/route.ts  ← custom events endpoint
│   ├── components/
│   │   └── AnalyticsScript.tsx
│   └── types.ts
```

### 3. Set Environment Variables

In your Vercel dashboard (or `.env.local` for local dev):

```env
TURSO_DATABASE_URL=libsql://my-analytics-yourname.turso.io
TURSO_AUTH_TOKEN=your-turso-token
ANALYTICS_KEY=any-random-secret-string
```

Generate a strong analytics key:
```bash
openssl rand -hex 32
```

### 4. Add the Script to Your Layout

```tsx
// src/app/layout.tsx
import { Suspense } from "react";
import AnalyticsScript from "@/components/AnalyticsScript";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Suspense>
          <AnalyticsScript />
        </Suspense>
      </body>
    </html>
  );
}
```

### 5. Install Dependencies

```bash
npm install @libsql/client ua-parser-js
npm install -D @types/ua-parser-js
```

### 6. Deploy & Open Your Dashboard

Deploy to Vercel. Then open `dashboard/index.html` locally — enter your site URL and analytics key.

That's it. You're tracking.

---

## Architecture

```
Browser                          Server (Vercel)              Database (Turso)
┌──────────────────┐    POST    ┌──────────────────┐         ┌────────────────┐
│ AnalyticsScript  │───────────>│ /api/analytics   │────────>│ page_views_v3  │
│                  │  sendBeacon│ /api/.../heartbeat│────────>│ engagement     │
│ (anonymous UUID) │            │ /api/.../event   │────────>│ custom_events  │
└──────────────────┘            └──────────────────┘         └────────────────┘
                                         │
                                    GET (Bearer)
                                         │
┌──────────────────┐            ┌──────────────────┐
│ dashboard.html   │<───────────│ /api/.../stats   │ Aggregated JSON
│ (local file)     │            │ /api/.../export  │ CSV/JSON raw data
└──────────────────┘            └──────────────────┘
```

**Key design decisions:**

- **`sendBeacon` over `fetch`** — non-blocking, survives page unloads, doesn't slow your site
- **Session ID via `crypto.randomUUID()`** — anonymous, ephemeral (sessionStorage), no cookies needed
- **Server-side UA parsing** — the client sends the raw user-agent string, the server extracts device/browser/OS using `ua-parser-js`. This keeps the client bundle tiny.
- **GeoIP via Vercel headers** — `x-vercel-ip-country` is free and automatic on Vercel. No third-party GeoIP service needed.
- **Heartbeat model** — a 30-second interval updates time-on-page and max scroll depth. Only fires when the tab is visible (`document.hidden` check).
- **Local dashboard** — the HTML file runs from `file://`. No server, no build step, no deployment. Just double-click it.

---

## Cookie Consent

Sovereign Analytics ships with a consent utility (`src/lib/consent.ts`). The `AnalyticsScript` component checks `hasConsented()` before firing — if the user hasn't accepted, nothing is tracked.

To integrate with your consent banner:

```tsx
import { setConsent } from "@/lib/consent";

// When user clicks "Accept"
setConsent("accepted");

// When user clicks "Decline"
setConsent("declined");
```

The consent status is stored in `localStorage` under the key `sa-consent`.

---

## Custom Events

Track any interaction by sending a POST to `/api/analytics/event`:

```tsx
// Example: track a CTA click
navigator.sendBeacon("/api/analytics/event", JSON.stringify({
  sessionId: sessionStorage.getItem("sa_sid"),
  name: "cta_click",
  path: window.location.pathname,
  properties: { button: "hero-signup", variant: "blue" },
  timestamp: new Date().toISOString(),
}));
```

Outbound link clicks, mailto:, and tel: clicks are tracked automatically by the `AnalyticsScript` component.

---

## Data Ownership

This is the core promise: **you own every byte**.

- Turso databases are SQLite under the hood. Run `turso db shell my-analytics` to query directly.
- Export anytime: the dashboard has CSV and JSON export buttons, or hit `/api/analytics/export?format=csv&days=90` directly.
- Back up your database: `turso db dump my-analytics > backup.sql`
- Move to any SQLite-compatible system whenever you want — there is no lock-in.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TURSO_DATABASE_URL` | Yes | Your Turso database URL |
| `TURSO_AUTH_TOKEN` | Yes | Turso auth token |
| `ANALYTICS_KEY` | Yes | Secret key for dashboard API access |
| `SITE_URL` | No | Your site URL (for reference) |

---

## Local Development

Without `TURSO_DATABASE_URL` set, the store falls back to in-memory storage. Page views and engagement data are tracked in memory — perfect for local dev, no database needed.

---

## License

MIT — do whatever you want with it.

---

**Built by [Vogt Innovation Group](https://github.com/VogtInnovationGroup)**
