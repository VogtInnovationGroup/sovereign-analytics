"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { hasConsented } from "@/lib/consent";

// ─── Session management (anonymous, no PII) ───

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let sid = sessionStorage.getItem("sa_sid");
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem("sa_sid", sid);
  }
  return sid;
}

function isNewVisitor(): boolean {
  if (typeof window === "undefined") return true;
  const key = "sa_returning";
  const returning = localStorage.getItem(key);
  if (!returning) {
    localStorage.setItem(key, "1");
    return true;
  }
  return false;
}

// ─── UTM extraction ───

function getUtmParams(searchParams: URLSearchParams) {
  return {
    utmSource: searchParams.get("utm_source") || "",
    utmMedium: searchParams.get("utm_medium") || "",
    utmCampaign: searchParams.get("utm_campaign") || "",
    utmTerm: searchParams.get("utm_term") || "",
    utmContent: searchParams.get("utm_content") || "",
  };
}

// ─── Scroll depth tracker ───

function getScrollDepth(): number {
  const docHeight = Math.max(
    document.body.scrollHeight,
    document.documentElement.scrollHeight
  );
  const viewHeight = window.innerHeight;
  const scrollTop = window.scrollY;
  if (docHeight <= viewHeight) return 100;
  return Math.min(100, Math.round(((scrollTop + viewHeight) / docHeight) * 100));
}

// ─── Outbound link tracking ───

function trackOutboundClicks(sessionId: string) {
  document.addEventListener("click", (e) => {
    const link = (e.target as HTMLElement).closest("a");
    if (!link) return;
    const href = link.getAttribute("href");
    if (!href) return;

    try {
      const url = new URL(href, window.location.origin);
      const isOutbound = url.hostname !== window.location.hostname;
      const isMailto = href.startsWith("mailto:");
      const isTel = href.startsWith("tel:");

      if (isOutbound || isMailto || isTel) {
        const eventData = JSON.stringify({
          sessionId,
          name: isMailto ? "mailto_click" : isTel ? "tel_click" : "outbound_click",
          path: window.location.pathname,
          properties: { url: href.slice(0, 200), text: (link.textContent || "").slice(0, 100) },
          timestamp: new Date().toISOString(),
        });
        navigator.sendBeacon?.("/api/analytics/event", eventData);
      }
    } catch {
      // Invalid URL, ignore
    }
  }, { passive: true });
}

// ─── Main component ───

export default function AnalyticsScript() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pageStartRef = useRef<number>(Date.now());
  const maxScrollRef = useRef<number>(0);
  const outboundTrackedRef = useRef(false);

  const updateScroll = useCallback(() => {
    const depth = getScrollDepth();
    if (depth > maxScrollRef.current) maxScrollRef.current = depth;
  }, []);

  useEffect(() => {
    if (!hasConsented()) return;

    const sessionId = getSessionId();
    if (!sessionId) return;

    const utm = getUtmParams(searchParams);

    // ─── Page view event ───
    const data = JSON.stringify({
      path: pathname,
      pageTitle: document.title || "",
      referrer: document.referrer || "(direct)",
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      sessionId,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      language: navigator.language || "",
      isNewVisitor: isNewVisitor(),
      ...utm,
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics", data);
    } else {
      fetch("/api/analytics", {
        method: "POST",
        body: data,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }).catch(() => {});
    }

    // ─── Scroll tracking ───
    maxScrollRef.current = 0;
    window.addEventListener("scroll", updateScroll, { passive: true });

    // ─── Outbound click tracking (once per session) ───
    if (!outboundTrackedRef.current) {
      trackOutboundClicks(sessionId);
      outboundTrackedRef.current = true;
    }

    // ─── Heartbeat: time on page + scroll depth ───
    pageStartRef.current = Date.now();
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);

    heartbeatRef.current = setInterval(() => {
      if (document.hidden) return;
      const duration = Math.round((Date.now() - pageStartRef.current) / 1000);
      const heartbeat = JSON.stringify({
        sessionId,
        path: pathname,
        duration,
        scrollDepth: maxScrollRef.current,
      });
      navigator.sendBeacon?.("/api/analytics/heartbeat", heartbeat);
    }, 30000);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      window.removeEventListener("scroll", updateScroll);

      // Send final heartbeat on page leave
      const duration = Math.round((Date.now() - pageStartRef.current) / 1000);
      if (duration > 2) {
        navigator.sendBeacon?.("/api/analytics/heartbeat", JSON.stringify({
          sessionId,
          path: pathname,
          duration,
          scrollDepth: maxScrollRef.current,
        }));
      }
    };
  }, [pathname, searchParams, updateScroll]);

  return null;
}
