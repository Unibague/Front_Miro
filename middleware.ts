export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/admin/:path*",
    "/dashboard/:path*",
    "/dependency/:path*",
    "/producer/:path*",
    "/responsible/:path*",
    "/templates/:path*",
    "/templates-with-filters/:path*",
  ],
};
