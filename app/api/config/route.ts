import { NextResponse } from "next/server"

export async function GET() {
    return NextResponse.json({
        accessCodeRequired: !!process.env.ACCESS_CODE_LIST,
    })
}
