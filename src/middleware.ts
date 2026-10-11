import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret");
const SESSION_COOKIE = "mvb_session";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }
    try {
      await jwtVerify(token, JWT_SECRET);
    } catch {
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
