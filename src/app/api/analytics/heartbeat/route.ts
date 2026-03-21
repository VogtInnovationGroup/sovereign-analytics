import { NextRequest, NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, path, duration, scrollDepth } = body;

    if (!sessionId || !path || typeof duration !== "number") {
      return NextResponse.json({ error: "Invalid" }, { status: 400 });
    }

    const cappedDuration = Math.min(duration, 1800);

    await recordHeartbeat({
      sessionId: sessionId.slice(0, 50),
      path: path.slice(0, 200),
      duration: cappedDuration,
      scrollDepth: typeof scrollDepth === "number" ? Math.min(scrollDepth, 100) : 0,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
