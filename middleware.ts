import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    /* Legacy URLs: no existe app/date-review (solo redirects aquí → processes-MEN). */
    if (pathname.startsWith("/date-review")) {
      const url = req.nextUrl.clone();
      url.pathname = pathname.replace(/^\/date-review/, "/processes-MEN");
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => {
        // Solo verificar que el usuario esté autenticado
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    "/admin/:path*",
    "/dashboard/:path*",
    "/dependency/:path*",
    "/producer/:path*",
    "/responsible/:path*",
    "/templates/:path*",
    "/templates-with-filters/:path*",
    "/date-review/:path*",
    "/processes-MEN/:path*",
  ],
};
