// Sovereign Analytics — Shared TypeScript types

export interface PageViewEvent {
  path: string;
  pageTitle: string;
  referrer: string;
  userAgent: string;
  timestamp: string;
  sessionId: string;
  screenWidth?: number;
  screenHeight?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  language?: string;
  isNewVisitor?: boolean;
  country?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
}

export interface HeartbeatEvent {
  sessionId: string;
  path: string;
  duration: number;
  scrollDepth?: number;
}

export interface CustomEvent {
  sessionId: string;
  name: string;
  path: string;
  properties?: Record<string, string | number>;
  timestamp: string;
}

export interface AggregatedStats {
  totalViews: number;
  uniqueSessions: number;
  uniquePaths: number;
  bounceRate: number;
  avgTimeOnPage: number;
  avgScrollDepth: number;
  pagesPerSession: number;
  newVisitorRate: number;
  topPages: { path: string; title: string; views: number; avgTime: number; avgScroll: number }[];
  topEntryPages: { path: string; count: number }[];
  topExitPages: { path: string; count: number }[];
  topReferrers: { referrer: string; count: number }[];
  topSources: { source: string; count: number }[];
  topCountries: { country: string; count: number }[];
  deviceBreakdown: { device: string; count: number }[];
  browserBreakdown: { browser: string; count: number }[];
  osBreakdown: { os: string; count: number }[];
  screenSizes: { size: string; count: number }[];
  recentViews: {
    path: string;
    title: string;
    referrer: string;
    timestamp: string;
    device: string;
    browser: string;
    country: string;
    sessionId: string;
  }[];
  viewsByDay: { date: string; count: number; sessions: number }[];
  viewsByHour: { hour: number; count: number }[];
  utmCampaigns: { campaign: string; source: string; views: number }[];
  customEvents: { name: string; count: number }[];
  liveCount: number;
}
