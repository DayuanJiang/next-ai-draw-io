/**
 * Prometheus 指标导出接口
 * 返回 Prometheus 格式的指标数据供 Prometheus Server 抓取
 */

import { NextResponse } from "next/server"
import { getMetrics } from "@/lib/metric"

export async function GET() {
    try {
        const metrics = await getMetrics()

        return new NextResponse(metrics, {
            status: 200,
            headers: {
                "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
            },
        })
    } catch (error) {
        console.error("❌ Error getting metrics:", error)
        return NextResponse.json(
            {
                error: "Failed to get metrics",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
        )
    }
}
