import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Deployment liveness probe for Vercel and uptime monitors. */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "curvin-frontend",
    time: new Date().toISOString(),
  });
}
