import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Firebase Studio preview บางครั้งพาไป /page
  if (pathname === "/page" || pathname === "/page/") {
    const url = req.nextUrl.clone();
    url.pathname = "/app/jobs";
    return NextResponse.redirect(url);
  }

  // (ถ้าต้องการให้ / ไป /app/jobs ด้วย ให้เปิดบรรทัดนี้)
  // if (pathname === "/") {
  //   const url = req.nextUrl.clone();
  //   url.pathname = "/app/jobs";
  //   return NextResponse.redirect(url);
  // }

  return NextResponse.next();
}

export const config = {
  matcher: ["/page", "/page/"],
};
