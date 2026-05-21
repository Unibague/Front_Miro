import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const backendUrl = `${process.env.API_URL}/qr/submit/${params.token}`;
  try {
    const body = await req.json();
    const res = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Error al conectar con el servidor" }, { status: 500 });
  }
}
