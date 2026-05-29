import { NextResponse } from "next/server";

export async function GET() {
  try {
    const apiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) return NextResponse.json([], { status: 500 });

    const res = await fetch(`${apiUrl}/periods/allperiods`, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
