import { NextRequest, NextResponse } from "next/server";
import { recordPageView } from "@/lib/store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { path, pageTitle, referrer, userAgent, timestamp, sessionId,
      screenWidth, screenHeight, viewportWidth, viewportHeight,
      language, isNewVisitor,
      utmSource, utmMedium, utmCampaign, utmTerm, utmContent } = body;

    if (!path || typeof path !== "string" || !sessionId) {
      return NextResponse.json({ error: "Missing path or sessionId" }, { status: 400 });
    }

    // Bot filtering
    const ua = (userAgent || "").toLowerCase();
    if (ua.includes("bot") || ua.includes("crawler") || ua.includes("spider") || ua.includes("headless")) {
      return NextResponse.json({ ok: true });
    }

    // GeoIP: Vercel provides country code via header (free, no third-party service needed)
    const country = req.headers.get("x-vercel-ip-country") || "";

    await recordPageView({
      path: path.slice(0, 200),
      pageTitle: (pageTitle || "").slice(0, 200),
      referrer: (referrer || "(direct)").slice(0, 500),
      userAgent: (userAgent || "").slice(0, 300),
      timestamp: timestamp || new Date().toISOString(),
      sessionId: sessionId.slice(0, 50),
      screenWidth: typeof screenWidth === "number" ? screenWidth : 0,
      screenHeight: typeof screenHeight === "number" ? screenHeight : 0,
      viewportWidth: typeof viewportWidth === "number" ? viewportWidth : 0,
      viewportHeight: typeof viewportHeight === "number" ? viewportHeight : 0,
      language: (language || "").slice(0, 10),
      isNewVisitor: !!isNewVisitor,
      country,
      utmSource: (utmSource || "").slice(0, 100),
      utmMedium: (utmMedium || "").slice(0, 100),
      utmCampaign: (utmCampaign || "").slice(0, 100),
      utmTerm: (utmTerm || "").slice(0, 100),
      utmContent: (utmContent || "").slice(0, 100),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
