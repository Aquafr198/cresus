import { NextResponse, type NextRequest } from "next/server";

/**
 * Same-origin Referer guard for sensitive static assets.
 *
 * Requests to /badges.svg that don't carry a Referer matching our own host
 * are rejected with 403. This blocks the most common scraping vectors:
 *   - curl / wget direct
 *   - cross-site hotlinking
 *   - direct paste of the URL in a new tab (most browsers send Referer there,
 *     but if it doesn't match our host the request still 403s)
 *
 * Does NOT prevent: opening DevTools → Network tab and copying the SVG source.
 * That requires the user to actively load the page first, which is fine —
 * the goal is to filter casual scrapers, not stop all extraction.
 */
const PROTECTED_PATHS = new Set(["/badges.svg"]);

export function middleware(req: NextRequest) {
  if (!PROTECTED_PATHS.has(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const referer = req.headers.get("referer");
  const host = req.headers.get("host");

  if (!referer || !host) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const refUrl = new URL(referer);
    // Allow if the Referer points back to our own host (regardless of protocol/port).
    if (refUrl.host === host) {
      return NextResponse.next();
    }
  } catch {
    // malformed Referer — block
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export const config = {
  matcher: ["/badges.svg"],
};
