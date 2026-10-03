import { NextResponse } from "next/server"
import { allowPrivateUrls, isPrivateUrl } from "@/lib/ssrf-protection"
import {
    extractSSYCloudModelIds,
    SSYCLOUD_DEFAULT_BASE_URL,
} from "@/lib/ssycloud-models"

export const runtime = "nodejs"

interface ModelsRequest {
    apiKey?: unknown
    baseUrl?: unknown
}

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as ModelsRequest
        const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : ""
        const baseUrl =
            typeof body.baseUrl === "string" && body.baseUrl.trim()
                ? body.baseUrl.trim().replace(/\/+$/, "")
                : SSYCLOUD_DEFAULT_BASE_URL

        if (!apiKey) {
            return NextResponse.json(
                { error: "API key is required" },
                { status: 400 },
            )
        }

        if (!allowPrivateUrls() && (await isPrivateUrl(baseUrl))) {
            return NextResponse.json(
                { error: "Invalid base URL" },
                { status: 400 },
            )
        }

        const response = await fetch(`${baseUrl}/models`, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
            cache: "no-store",
        })

        if (!response.ok) {
            return NextResponse.json(
                { error: `Failed to load models (${response.status})` },
                { status: response.status },
            )
        }

        const models = extractSSYCloudModelIds(await response.json())
        return NextResponse.json(
            { models, source: "ssycloud" },
            { headers: { "Cache-Control": "no-store" } },
        )
    } catch (error) {
        console.warn("[ssycloud-models] Failed to load models:", error)
        return NextResponse.json(
            { error: "Failed to load models" },
            { status: 502 },
        )
    }
}
