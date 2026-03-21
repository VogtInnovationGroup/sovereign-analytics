import { NextRequest } from "next/server";
import { exportData } from "@/lib/store";
import { corsResponse, corsRawResponse, corsOptions } from "@/lib/cors";

export async function OPTIONS() { return corsOptions(); }

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const authKey = authHeader.replace(/^Bearer\s+/i, "");
  const expectedKey = process.env.ANALYTICS_KEY;

  if (!expectedKey || authKey !== expectedKey) {
    return corsResponse({ error: "Unauthorized" }, 401);
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") === "csv" ? "csv" : "json";
  const days = Math.min(parseInt(searchParams.get("days") || "30", 10) || 30, 365);

  const data = await exportData(format, days);

  if (format === "csv") {
    return corsRawResponse(data, "text/csv", {
      "Content-Disposition": `attachment; filename="analytics-${days}d.csv"`,
    });
  }

  return corsRawResponse(data, "application/json");
}
