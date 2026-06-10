import { NextResponse } from "next/server"
import {
    AIHUBMIX_MODELS_ENDPOINT,
    extractAihubmixModelIds,
} from "@/lib/aihubmix-models"
import { SUGGESTED_MODELS } from "@/lib/types/model-config"

const SUCCESS_CACHE_CONTROL =
    "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"

function fallbackResponse() {
    return NextResponse.json(
        {
            models: SUGGESTED_MODELS.aihubmix || [],
            source: "fallback",
        },
        {
            headers: {
                "Cache-Control": "no-store",
            },
        },
    )
}

export async function GET() {
    try {
        const response = await fetch(AIHUBMIX_MODELS_ENDPOINT, {
            next: { revalidate: 3600 },
        })

        if (!response.ok) {
            console.warn(
                `[aihubmix-models] Failed to fetch models: ${response.status}`,
            )
            return fallbackResponse()
        }

        const payload = await response.json()
        const models = extractAihubmixModelIds(payload)

        if (models.length === 0) {
            console.warn("[aihubmix-models] Model list response was empty")
            return fallbackResponse()
        }

        return NextResponse.json(
            {
                models,
                source: "aihubmix",
            },
            {
                headers: {
                    "Cache-Control": SUCCESS_CACHE_CONTROL,
                },
            },
        )
    } catch (error) {
        console.warn("[aihubmix-models] Failed to load models:", error)
        return fallbackResponse()
    }
}
