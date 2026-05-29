/**
 * Thin proxy → Rust backend `POST /api/v1/apply`.
 *
 * Rationale: the frontend form posts to this same-origin route to avoid
 * CORS preflight on every public form submission. Real validation,
 * persistence, rate-limit, and Telegram notify happen in Rust.
 */

import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE =
  process.env.OFFIVEX_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:3001/api/v1";

export async function POST(req: NextRequest) {
  // Read body as text once; we forward it verbatim to the backend.
  let bodyText: string;
  try {
    bodyText = await req.text();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Forward the real client IP so the backend can audit it.
  const xff =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "";

  let res: Response;
  try {
    res = await fetch(`${BACKEND_BASE}/apply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(xff ? { "x-forwarded-for": xff } : {}),
      },
      body: bodyText,
      // No automatic retry — apply submission must be idempotent at the user level.
    });
  } catch (e) {
    console.error("apply proxy: backend unreachable", e);
    return NextResponse.json(
      { error: "Service temporarily unavailable. Please email hello@offivex.io." },
      { status: 502 }
    );
  }

  // Mirror status + JSON body from backend. Map backend's `success/error` shape
  // to the legacy shape the form expects (`{ ok: true }` on success).
  const backendBody = await res.json().catch(() => ({ error: "Bad gateway response" }));

  if (!res.ok) {
    return NextResponse.json(
      { error: backendBody.error || `Backend ${res.status}` },
      { status: res.status }
    );
  }

  return NextResponse.json({ ok: true, id: backendBody?.data?.id });
}
