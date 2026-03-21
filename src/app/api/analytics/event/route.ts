import { NextRequest, NextResponse } from "next/server";
import { recordCustomEvent } from "@/lib/store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, name, path, properties, timestamp } = body;

    if (!sessionId || !name) {
      return NextResponse.json({ error: "Missing sessionId or name" }, { status: 400 });
    }

    await recordCustomEvent({
      sessionId: sessionId.slice(0, 50),
      name: name.slice(0, 100),
      path: (path || "").slice(0, 200),
      properties: typeof properties === "object" ? properties : {},
      timestamp: timestamp || new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
