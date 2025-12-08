import { NextResponse } from "next/server"

export async function GET() {
    const accessCodes =
        process.env.ACCESS_CODE_LIST?.split(",")
            .map((code) => code.trim())
            .filter(Boolean) || []

    return NextResponse.json({
        accessCodeRequired: accessCodes.length > 0,
        dailyRequestLimit: parseInt(process.env.DAILY_REQUEST_LIMIT || "0", 10),
    })
}
