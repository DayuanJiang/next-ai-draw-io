import { NextResponse } from "next/server";

export async function GET() {
  const accessCodes = process.env.ACCESS_CODES?.split(',').map(code => code.trim()).filter(Boolean) || [];

  return NextResponse.json({
    accessCodeRequired: accessCodes.length > 0,
  });
}
