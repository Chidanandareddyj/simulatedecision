import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ok", service: "delhi-twin", censusYear: 2011 });
}
