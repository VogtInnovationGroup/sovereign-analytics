// Sovereign Analytics — Data store
// Turso/libSQL for production, in-memory fallback for local dev
// Zero third-party data sharing. Your database, your SQLite file.

import { createClient, type Client } from "@libsql/client";
import { UAParser } from "ua-parser-js";
import type {
  PageViewEvent,
  HeartbeatEvent,
  CustomEvent,
  AggregatedStats,
} from "../types";

// ─── Turso client (singleton) ───

let _db: Client | null = null;
let _initialized = false;

function getDb(): Client | null {
  if (!process.env.TURSO_DATABASE_URL) return null;
  if (!_db) {
    _db = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return _db;
}

async function ensureSchema() {
  const db = getDb();
  if (!db || _initialized) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS page_views_v3 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      page_title TEXT DEFAULT '',
      referrer TEXT DEFAULT '',
      session_id TEXT NOT NULL,
      device_type TEXT DEFAULT '',
      browser TEXT DEFAULT '',
      browser_version TEXT DEFAULT '',
      os TEXT DEFAULT '',
      os_version TEXT DEFAULT '',
      screen_width INTEGER DEFAULT 0,
      screen_height INTEGER DEFAULT 0,
      viewport_width INTEGER DEFAULT 0,
      viewport_height INTEGER DEFAULT 0,
      country TEXT DEFAULT '',
      language TEXT DEFAULT '',
      is_new_visitor INTEGER DEFAULT 0,
      utm_source TEXT DEFAULT '',
      utm_medium TEXT DEFAULT '',
      utm_campaign TEXT DEFAULT '',
      utm_term TEXT DEFAULT '',
      utm_content TEXT DEFAULT '',
      timestamp TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS engagement (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      path TEXT NOT NULL,
      duration INTEGER DEFAULT 0,
      scroll_depth INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS custom_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      path TEXT DEFAULT '',
      properties TEXT DEFAULT '{}',
      timestamp TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Migration: add scroll_depth if upgrading from earlier schema
  try {
    await db.execute(`ALTER TABLE engagement ADD COLUMN scroll_depth INTEGER DEFAULT 0`);
  } catch {
    // Column already exists
  }

  // Indexes for query performance
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_pv3_path ON page_views_v3(path)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_pv3_timestamp ON page_views_v3(timestamp)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_pv3_session ON page_views_v3(session_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_pv3_country ON page_views_v3(country)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_eng_session_path ON engagement(session_id, path)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_ce_name ON custom_events(name)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_ce_session ON custom_events(session_id)`);

  _initialized = true;
}

// ─── Device parsing ───

function parseDevice(userAgent: string) {
  const parser = new UAParser(userAgent);
  const result = parser.getResult();
  const deviceType = result.device.type || "desktop";
  return {
    device: deviceType === "mobile" ? "Mobile" : deviceType === "tablet" ? "Tablet" : "Desktop",
    browser: result.browser.name || "Unknown",
    browserVersion: result.browser.version?.split(".")[0] || "",
    os: result.os.name || "Unknown",
    osVersion: result.os.version || "",
  };
}

// ─── In-memory fallback (local dev) ───

interface MemView extends PageViewEvent {
  device: string;
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
}
const memViews: MemView[] = [];
const memEngagement = new Map<string, { duration: number; scrollDepth: number }>();
const memEvents: CustomEvent[] = [];

// ─── Public API ───

export async function recordPageView(event: PageViewEvent) {
  const parsed = parseDevice(event.userAgent);
  const db = getDb();

  if (db) {
    await ensureSchema();
    await db.execute({
      sql: `INSERT INTO page_views_v3 (path, page_title, referrer, session_id, device_type, browser, browser_version, os, os_version, screen_width, screen_height, viewport_width, viewport_height, country, language, is_new_visitor, utm_source, utm_medium, utm_campaign, utm_term, utm_content, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        event.path, event.pageTitle || "", event.referrer, event.sessionId,
        parsed.device, parsed.browser, parsed.browserVersion, parsed.os, parsed.osVersion,
        event.screenWidth || 0, event.screenHeight || 0, event.viewportWidth || 0, event.viewportHeight || 0,
        event.country || "", event.language || "", event.isNewVisitor ? 1 : 0,
        event.utmSource || "", event.utmMedium || "", event.utmCampaign || "",
        event.utmTerm || "", event.utmContent || "", event.timestamp,
      ],
    });
  } else {
    memViews.push({ ...event, ...parsed });
    if (memViews.length > 10000) memViews.splice(0, memViews.length - 10000);
  }
}

export async function recordHeartbeat(event: HeartbeatEvent) {
  const db = getDb();
  const key = `${event.sessionId}:${event.path}`;

  if (db) {
    await ensureSchema();
    const existing = await db.execute({
      sql: `SELECT id FROM engagement WHERE session_id = ? AND path = ?`,
      args: [event.sessionId, event.path],
    });
    if (existing.rows.length > 0) {
      await db.execute({
        sql: `UPDATE engagement SET duration = ?, scroll_depth = MAX(scroll_depth, ?), updated_at = datetime('now') WHERE session_id = ? AND path = ?`,
        args: [event.duration, event.scrollDepth || 0, event.sessionId, event.path],
      });
    } else {
      await db.execute({
        sql: `INSERT INTO engagement (session_id, path, duration, scroll_depth) VALUES (?, ?, ?, ?)`,
        args: [event.sessionId, event.path, event.duration, event.scrollDepth || 0],
      });
    }
  } else {
    const prev = memEngagement.get(key);
    memEngagement.set(key, {
      duration: event.duration,
      scrollDepth: Math.max(prev?.scrollDepth || 0, event.scrollDepth || 0),
    });
  }
}

export async function recordCustomEvent(event: CustomEvent) {
  const db = getDb();
  if (db) {
    await ensureSchema();
    await db.execute({
      sql: `INSERT INTO custom_events (session_id, name, path, properties, timestamp) VALUES (?, ?, ?, ?, ?)`,
      args: [
        event.sessionId, event.name, event.path,
        JSON.stringify(event.properties || {}),
        event.timestamp,
      ],
    });
  } else {
    memEvents.push(event);
    if (memEvents.length > 5000) memEvents.splice(0, memEvents.length - 5000);
  }
}

export async function getStats(): Promise<AggregatedStats> {
  const db = getDb();
  if (db) {
    await ensureSchema();
    return getStatsTurso(db);
  }
  return getStatsMemory();
}

export async function exportData(format: "json" | "csv", days = 30): Promise<string> {
  const db = getDb();
  if (!db) return format === "json" ? "[]" : "";
  await ensureSchema();

  const result = await db.execute({
    sql: `SELECT path, page_title, referrer, session_id, device_type, browser, browser_version, os, os_version, screen_width, screen_height, country, language, is_new_visitor, utm_source, utm_medium, utm_campaign, timestamp FROM page_views_v3 WHERE timestamp >= date('now', '-' || ? || ' days') ORDER BY id DESC`,
    args: [days],
  });

  if (format === "json") return JSON.stringify(result.rows, null, 2);

  const headers = "path,page_title,referrer,session_id,device,browser,browser_version,os,os_version,screen,country,language,is_new,utm_source,utm_medium,utm_campaign,timestamp";
  const rows = result.rows.map((r) =>
    [r.path, r.page_title, r.referrer, r.session_id, r.device_type, r.browser, r.browser_version, r.os, r.os_version, `${r.screen_width}x${r.screen_height}`, r.country, r.language, r.is_new_visitor, r.utm_source, r.utm_medium, r.utm_campaign, r.timestamp]
      .map((v) => `"${String(v || "").replace(/"/g, '""')}"`)
      .join(",")
  );
  return [headers, ...rows].join("\n");
}

// ─── Turso aggregation queries ───

async function getStatsTurso(db: Client): Promise<AggregatedStats> {
  const r = await Promise.all([
    db.execute(`SELECT COUNT(*) as cnt FROM page_views_v3`),
    db.execute(`SELECT COUNT(DISTINCT session_id) as cnt FROM page_views_v3`),
    db.execute(`SELECT COUNT(DISTINCT path) as cnt FROM page_views_v3`),
    db.execute(`
      SELECT pv.path, pv.page_title as title, COUNT(*) as views, COALESCE(AVG(e.duration), 0) as avgTime, COALESCE(AVG(e.scroll_depth), 0) as avgScroll
      FROM page_views_v3 pv LEFT JOIN engagement e ON pv.path = e.path AND pv.session_id = e.session_id
      GROUP BY pv.path ORDER BY views DESC LIMIT 10
    `),
    db.execute(`SELECT referrer, COUNT(*) as count FROM page_views_v3 WHERE referrer != '' AND referrer != '(direct)' GROUP BY referrer ORDER BY count DESC LIMIT 10`),
    db.execute(`SELECT utm_source as source, COUNT(*) as count FROM page_views_v3 WHERE utm_source != '' GROUP BY utm_source ORDER BY count DESC LIMIT 10`),
    db.execute(`SELECT device_type as device, COUNT(*) as count FROM page_views_v3 WHERE device_type != '' GROUP BY device_type ORDER BY count DESC`),
    db.execute(`SELECT browser || ' ' || browser_version as browser, COUNT(*) as count FROM page_views_v3 WHERE browser != '' GROUP BY browser ORDER BY count DESC LIMIT 8`),
    db.execute(`SELECT os || ' ' || os_version as os, COUNT(*) as count FROM page_views_v3 WHERE os != '' GROUP BY os ORDER BY count DESC LIMIT 8`),
    db.execute(`SELECT path, page_title as title, referrer, timestamp, device_type as device, browser, country, session_id FROM page_views_v3 ORDER BY id DESC LIMIT 20`),
    db.execute(`SELECT substr(timestamp, 1, 10) as date, COUNT(*) as count, COUNT(DISTINCT session_id) as sessions FROM page_views_v3 WHERE timestamp >= date('now', '-30 days') GROUP BY date ORDER BY date ASC`),
    db.execute(`SELECT utm_campaign as campaign, utm_source as source, COUNT(*) as views FROM page_views_v3 WHERE utm_campaign != '' GROUP BY utm_campaign, utm_source ORDER BY views DESC LIMIT 10`),
    db.execute(`SELECT CASE WHEN COUNT(*) > 0 THEN ROUND(100.0 * SUM(CASE WHEN pv_count = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) ELSE 0 END as bounce_rate FROM (SELECT session_id, COUNT(*) as pv_count FROM page_views_v3 GROUP BY session_id)`),
    db.execute(`SELECT COALESCE(AVG(duration), 0) as avg_time, COALESCE(AVG(CASE WHEN scroll_depth > 0 THEN scroll_depth END), 0) as avg_scroll FROM engagement WHERE duration > 0`),
    db.execute(`SELECT country, COUNT(*) as count FROM page_views_v3 WHERE country != '' GROUP BY country ORDER BY count DESC LIMIT 15`),
    db.execute(`SELECT ROUND(1.0 * (SELECT COUNT(*) FROM page_views_v3) / MAX((SELECT COUNT(DISTINCT session_id) FROM page_views_v3), 1), 1) as pps`),
    db.execute(`SELECT CASE WHEN COUNT(*) > 0 THEN ROUND(100.0 * SUM(is_new_visitor) / COUNT(*), 1) ELSE 0 END as new_rate FROM page_views_v3`),
    db.execute(`SELECT screen_width || 'x' || screen_height as size, COUNT(*) as count FROM page_views_v3 WHERE screen_width > 0 GROUP BY size ORDER BY count DESC LIMIT 8`),
    db.execute(`SELECT path, COUNT(*) as count FROM (SELECT session_id, path, MIN(id) as mid FROM page_views_v3 GROUP BY session_id) GROUP BY path ORDER BY count DESC LIMIT 10`),
    db.execute(`SELECT path, COUNT(*) as count FROM (SELECT session_id, path, MAX(id) as mid FROM page_views_v3 GROUP BY session_id) GROUP BY path ORDER BY count DESC LIMIT 10`),
    db.execute(`SELECT CAST(substr(timestamp, 12, 2) AS INTEGER) as hour, COUNT(*) as count FROM page_views_v3 GROUP BY hour ORDER BY hour`),
    db.execute(`SELECT name, COUNT(*) as count FROM custom_events GROUP BY name ORDER BY count DESC LIMIT 10`),
    db.execute(`SELECT COUNT(DISTINCT session_id) as cnt FROM page_views_v3 WHERE timestamp >= datetime('now', '-5 minutes')`),
  ]);

  return {
    totalViews: Number(r[0].rows[0]?.cnt ?? 0),
    uniqueSessions: Number(r[1].rows[0]?.cnt ?? 0),
    uniquePaths: Number(r[2].rows[0]?.cnt ?? 0),
    bounceRate: Number(r[12].rows[0]?.bounce_rate ?? 0),
    avgTimeOnPage: Math.round(Number(r[13].rows[0]?.avg_time ?? 0)),
    avgScrollDepth: Math.round(Number(r[13].rows[0]?.avg_scroll ?? 0)),
    pagesPerSession: Number(r[15].rows[0]?.pps ?? 0),
    newVisitorRate: Number(r[16].rows[0]?.new_rate ?? 0),
    topPages: r[3].rows.map((row) => ({ path: String(row.path), title: String(row.title || ""), views: Number(row.views), avgTime: Math.round(Number(row.avgTime ?? 0)), avgScroll: Math.round(Number(row.avgScroll ?? 0)) })),
    topEntryPages: r[18].rows.map((row) => ({ path: String(row.path), count: Number(row.count) })),
    topExitPages: r[19].rows.map((row) => ({ path: String(row.path), count: Number(row.count) })),
    topReferrers: r[4].rows.map((row) => ({ referrer: String(row.referrer), count: Number(row.count) })),
    topSources: r[5].rows.map((row) => ({ source: String(row.source), count: Number(row.count) })),
    topCountries: r[14].rows.map((row) => ({ country: String(row.country), count: Number(row.count) })),
    deviceBreakdown: r[6].rows.map((row) => ({ device: String(row.device), count: Number(row.count) })),
    browserBreakdown: r[7].rows.map((row) => ({ browser: String(row.browser), count: Number(row.count) })),
    osBreakdown: r[8].rows.map((row) => ({ os: String(row.os), count: Number(row.count) })),
    screenSizes: r[17].rows.map((row) => ({ size: String(row.size), count: Number(row.count) })),
    recentViews: r[9].rows.map((row) => ({ path: String(row.path), title: String(row.title || ""), referrer: String(row.referrer), timestamp: String(row.timestamp), device: String(row.device), browser: String(row.browser), country: String(row.country), sessionId: String(row.session_id) })),
    viewsByDay: r[10].rows.map((row) => ({ date: String(row.date), count: Number(row.count), sessions: Number(row.sessions) })),
    viewsByHour: r[20].rows.map((row) => ({ hour: Number(row.hour), count: Number(row.count) })),
    utmCampaigns: r[11].rows.map((row) => ({ campaign: String(row.campaign), source: String(row.source), views: Number(row.views) })),
    customEvents: r[21].rows.map((row) => ({ name: String(row.name), count: Number(row.count) })),
    liveCount: Number(r[22].rows[0]?.cnt ?? 0),
  };
}

// ─── In-memory fallback ───

function getStatsMemory(): AggregatedStats {
  const pageCounts = new Map<string, number>();
  const sessionPages = new Map<string, Set<string>>();

  for (const v of memViews) {
    pageCounts.set(v.path, (pageCounts.get(v.path) || 0) + 1);
    if (!sessionPages.has(v.sessionId)) sessionPages.set(v.sessionId, new Set());
    sessionPages.get(v.sessionId)!.add(v.path);
  }

  const totalSessions = sessionPages.size;
  const bounceSessions = [...sessionPages.values()].filter((p) => p.size === 1).length;

  return {
    totalViews: memViews.length,
    uniqueSessions: totalSessions,
    uniquePaths: pageCounts.size,
    bounceRate: totalSessions > 0 ? Math.round((bounceSessions / totalSessions) * 100) : 0,
    avgTimeOnPage: 0,
    avgScrollDepth: 0,
    pagesPerSession: 0,
    newVisitorRate: 0,
    topPages: [...pageCounts.entries()]
      .map(([path, views]) => ({ path, title: "", views, avgTime: 0, avgScroll: 0 }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10),
    topEntryPages: [],
    topExitPages: [],
    topReferrers: [],
    topSources: [],
    topCountries: [],
    deviceBreakdown: [],
    browserBreakdown: [],
    osBreakdown: [],
    screenSizes: [],
    recentViews: memViews
      .slice(-20)
      .reverse()
      .map((v) => ({
        path: v.path,
        title: v.pageTitle || "",
        referrer: v.referrer,
        timestamp: v.timestamp,
        device: v.device,
        browser: v.browser,
        country: v.country || "",
        sessionId: v.sessionId,
      })),
    viewsByDay: [],
    viewsByHour: [],
    utmCampaigns: [],
    customEvents: [],
    liveCount: totalSessions > 0 ? 1 : 0,
  };
}
