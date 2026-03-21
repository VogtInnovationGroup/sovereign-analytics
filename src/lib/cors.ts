// CORS headers — allows local dashboard (file://) and custom domains to access the API
import { NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export function corsResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsHeaders });
}

export function corsRawResponse(body: string, contentType: string, headers: Record<string, string> = {}) {
  return new Response(body, {
    headers: { ...corsHeaders, "Content-Type": contentType, ...headers },
  });
}

export function corsOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
