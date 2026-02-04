/**
 * 监控指标管理和上报
 * 使用 prom-client 库管理 Prometheus 指标
 */

import { Counter, Registry } from "prom-client"

// ==================== Prometheus 指标注册 ====================

const METRIC_NAME_AI_CENTER_CALLS_COUNT_TOTAL = "ai_center_calls_count_total"

// 创建全局注册表（仅在服务端创建）
export let register: Registry | null = null
let aiCenterCallsCounter: Counter<string> | null = null

// 初始化 Prometheus 指标（仅在服务端）
function initPrometheus() {
    // 只在服务端初始化
    if (typeof window !== "undefined") {
        return
    }

    if (!register) {
        register = new Registry()

        // AI Center 调用计数指标（按照公司标准定义标签）
        aiCenterCallsCounter = new Counter({
            name: METRIC_NAME_AI_CENTER_CALLS_COUNT_TOTAL,
            help: "AI中心服务调用计数",
            labelNames: [
                "entity_type", // 实体类型
                "entity_name", // 实体名称
                "entity_name_cn", // 实体中文名称
                "function_desc", // 功能描述
                "consumer", // 消费者
                "args", // 参数
            ],
            registers: [register],
        })

        console.log("✅ Prometheus metrics initialized")
    }
}

// 初始化
initPrometheus()

// ==================== 服务端监控记录函数 ====================

/**
 * 记录 AI 调用计数（服务端使用）
 * 直接记录到 Prometheus 指标，不需要 HTTP 请求
 *
 * @param labels - 标签，按照公司标准定义
 *
 * @example
 * reportAICenterCall({
 *   entity_type: 'ai_model',
 *   entity_name: 'gpt-4',
 *   entity_name_cn: 'GPT-4模型',
 *   function_desc: '绘图对话',
 *   consumer: 'next-ai-draw-io',
 *   args: JSON.stringify({ endpoint: '/api/chat' })
 * });
 */
export function reportAICenterCall(labels: {
    entity_type?: string // 实体类型，如：ai_model
    entity_name?: string // 实体名称，如：gpt-4
    entity_name_cn?: string // 实体中文名称，如：GPT-4模型
    function_desc?: string // 功能描述，如：绘图对话
    consumer?: string // 消费者，如：next-ai-draw-io
    args?: string // 参数（JSON字符串）
}) {
    try {
        // 只在服务端记录
        if (typeof window !== "undefined") {
            return
        }

        if (!aiCenterCallsCounter) {
            console.warn("[Metric] AI Center counter not initialized")
            return
        }

        // 确保所有标签都是字符串类型
        const stringLabels: Record<string, string> = {}
        for (const [key, value] of Object.entries(labels)) {
            if (value !== undefined) {
                stringLabels[key] = String(value)
            }
        }

        aiCenterCallsCounter.inc(stringLabels)
        console.log("📊 AI Center call recorded:", stringLabels)
    } catch (error) {
        console.error("❌ Error recording AI Center call:", error)
    }
}

/**
 * 获取所有指标的 Prometheus 格式数据（供 /metrics 接口使用）
 */
export async function getMetrics(): Promise<string> {
    if (!register) {
        initPrometheus()
    }
    return register ? register.metrics() : ""
}
