import { NextResponse } from "next/server"

export async function GET() {
    const accessCodes =
        process.env.ACCESS_CODE_LIST?.split(",")
            .map((code) => code.trim())
            .filter(Boolean) || []

    return NextResponse.json({
        accessCodeRequired: accessCodes.length > 0,
        pdfInputEnabled: process.env.ENABLE_PDF_INPUT === "true",
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE || "5242880", 10),
        supportedProviders: ["anthropic", "openai", "google", "vertex"],
    })
}
