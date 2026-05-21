import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.API_URL ?? "";

async function proxy(req: NextRequest, params: { path: string[] }) {
  if (!BACKEND) {
    return NextResponse.json({ error: "API_URL no esta configurado." }, { status: 500 });
  }

  const path = params.path.join("/");
  const search = req.nextUrl.search;
  const url = `${BACKEND}/${path}${search}`;

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("content-length");

  let body: ArrayBuffer | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    try { body = await req.arrayBuffer(); } catch { /* empty body */ }
  }

  const res = await fetch(url, {
    method: req.method,
    headers,
    body,
    cache: "no-store",
  });

  const data = await res.arrayBuffer();
  return new NextResponse(data, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/json",
    },
  });
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params);
}
export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params);
}
export async function PUT(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params);
}
export async function PATCH(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params);
}
export async function DELETE(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params);
}
