import { NextRequest, NextResponse } from "next/server";

// Strip /api/d or /api/p to get the Express server base URL
const BACKEND_BASE = (process.env.API_URL ?? "http://localhost:3456/api/d")
  .replace(/\/api\/[dp]$/, "");

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const filePath = params.path.join("/");
  const url = `${BACKEND_BASE}/uploads/${filePath}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.arrayBuffer();

  const headers = new Headers();
  const ct = res.headers.get("Content-Type");
  if (ct) headers.set("Content-Type", ct);
  const cd = res.headers.get("Content-Disposition");
  if (cd) headers.set("Content-Disposition", cd);

  return new NextResponse(data, { status: res.status, headers });
}
