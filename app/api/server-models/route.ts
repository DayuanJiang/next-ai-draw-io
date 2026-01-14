import { NextResponse } from "next/server"
import { loadFlattenedServerModels } from "@/lib/server-model-config"

export async function GET() {
    const models = await loadFlattenedServerModels()
    return NextResponse.json({
        models,
        hasConfig: models.length > 0,
    })
}
