import { NextRequest, NextResponse } from "next/server";

/**
 * Cek presence cookie session — kalau gak ada, redirect ke /login.
 * Validasi DB-nya dilakukan di server component / API route biar gak
 * conflict sama edge runtime middleware.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has("mars_session");

  // Login page: kalau udah ada cookie, redirect ke /
  if (pathname === "/login") {
    if (hasSession) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  // Semua route lain (selain /login) butuh cookie
  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths kecuali:
     * - /api/auth/* (login/logout)
     * - /api/v1/* dan /api/v2/* (public API dengan API key auth)
     * - /_next (static assets)
     * - /favicon, /images, etc
     */
    "/((?!api/auth|api/v1|api/v2|_next/static|_next/image|favicon.ico).*)",
  ],
};
