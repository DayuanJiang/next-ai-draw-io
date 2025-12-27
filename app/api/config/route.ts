import { NextResponse } from "next/server"

export async function GET() {
    return NextResponse.json({
        accessCodeRequired: !!process.env.ACCESS_CODE_LIST,
        dailyRequestLimit: Number(process.env.DAILY_REQUEST_LIMIT) || 0,
        dailyTokenLimit: Number(process.env.DAILY_TOKEN_LIMIT) || 0,
        tpmLimit: Number(process.env.TPM_LIMIT) || 0,
    })
}
