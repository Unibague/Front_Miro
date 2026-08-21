import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithRetry = async (url: string, options: RequestInit, method: string) => {
  const maxAttempts = method === "GET" || method === "HEAD" ? 3 : 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) break;
      await sleep(250 * attempt);
    }
  }

  throw lastError;
};

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

  let res: Response;
  try {
    res = await fetchWithRetry(url, {
      method: req.method,
      headers,
      body,
      cache: "no-store",
    }, req.method);
  } catch (error) {
    console.error(`Backend proxy error for ${req.method} ${url}:`, error);
    return NextResponse.json(
      { error: "No se pudo conectar con el backend. Intenta nuevamente." },
      { status: 502 }
    );
  }

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
