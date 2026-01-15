import { NextResponse } from "next/server"
import { loadFlattenedServerModels } from "@/lib/server-model-config"

// Server models configuration rarely changes, so we can serve this route statically
export const dynamic = "force-static"

export async function GET() {
    const models = await loadFlattenedServerModels()
    return NextResponse.json({
        models,
        hasConfig: models.length > 0,
    })
}
