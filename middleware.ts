import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    // Permitir acceso a todas las rutas autenticadas
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
  ],
};
