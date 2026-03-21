import { NextRequest } from "next/server";
import { getStats } from "@/lib/store";
import { corsResponse, corsOptions } from "@/lib/cors";

export async function OPTIONS() { return corsOptions(); }

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const authKey = authHeader.replace(/^Bearer\s+/i, "");
  const expectedKey = process.env.ANALYTICS_KEY;

  if (!expectedKey || authKey !== expectedKey) {
    return corsResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const stats = await getStats();
    return corsResponse(stats);
  } catch (err) {
    console.error("Analytics stats error:", err);
    return corsResponse({ error: "Internal error" }, 500);
  }
}
