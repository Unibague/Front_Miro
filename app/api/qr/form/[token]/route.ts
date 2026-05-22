import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const apiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: "API_URL no esta configurado." }, { status: 500 });
  }

  const backendUrl = `${apiUrl}/qr/form/${params.token}`;
  try {
    const res = await fetch(backendUrl, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Error al conectar con el servidor" }, { status: 500 });
  }
}
