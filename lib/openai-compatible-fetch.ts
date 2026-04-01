const VALIDATION_PROBE_PROMPT = "Say 'OK'"

interface ValidationProbeRequest {
    model?: string
}

function parseJsonSafely(value: string): unknown {
    try {
        return JSON.parse(value)
    } catch {
        return undefined
    }
}

function getValidationProbeRequest(
    body: BodyInit | null | undefined,
): ValidationProbeRequest | undefined {
    if (typeof body !== "string") {
        return undefined
    }

    const parsed = parseJsonSafely(body)
    if (!parsed || typeof parsed !== "object") {
        return undefined
    }

    const request = parsed as {
        model?: unknown
        messages?: Array<{ role?: unknown; content?: unknown }>
        max_tokens?: unknown
    }

    const firstMessage = request.messages?.[0]
    if (
        request.messages?.length !== 1 ||
        firstMessage?.role !== "user" ||
        firstMessage.content !== VALIDATION_PROBE_PROMPT
    ) {
        return undefined
    }

    return {
        model: typeof request.model === "string" ? request.model : undefined,
    }
}

function isSuccessOnlyValidationResponse(data: unknown): boolean {
    if (!data || typeof data !== "object") {
        return false
    }

    const response = data as {
        success?: unknown
        choices?: unknown
        error?: unknown
    }

    return (
        response.success === true &&
        response.choices === undefined &&
        response.error === undefined
    )
}

function createSyntheticValidationResponse(model?: string): string {
    return JSON.stringify({
        id: "chatcmpl-validation-probe",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
            {
                index: 0,
                message: {
                    role: "assistant",
                    content: "OK",
                },
                finish_reason: "stop",
            },
        ],
        usage: {
            prompt_tokens: 1,
            completion_tokens: 1,
            total_tokens: 2,
        },
    })
}

export function createOpenAICompatibleFetch(
    baseFetch: typeof fetch = fetch,
): typeof fetch {
    return async (input, init) => {
        const validationProbe = getValidationProbeRequest(init?.body)

        // Debug: Log full request body for MiniMax errors
        if (typeof input === 'string' && input.includes('minimaxi')) {
            try {
                const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body
                if (body) {
                    // Log request metadata
                    console.log('[MiniMax Request] URL:', input)
                    console.log('[MiniMax Request] Model:', body.model)
                    console.log('[MiniMax Request] Total messages:', body.messages?.length)

                    // Find all assistant messages and log their structure
                    body.messages?.forEach((m: any, idx: number) => {
                        if (m.role === 'assistant') {
                            const hasContent = m.content && m.content.length > 0
                            const hasToolCalls = m.tool_calls && m.tool_calls.length > 0
                            console.log(`  [${idx}] assistant: content=${hasContent ? 'yes' : 'empty'}, tool_calls=${hasToolCalls ? m.tool_calls.length : 0}`)
                            if (m.tool_calls) {
                                m.tool_calls.forEach((tc: any, tcIdx: number) => {
                                    console.log(`    tool_call[${tcIdx}]: id=${tc.id}, type=${tc.type}, function=${tc.function?.name}`)
                                })
                            }
                        } else if (m.role === 'tool') {
                            console.log(`  [${idx}] tool: tool_call_id=${m.tool_call_id}, content_length=${m.content?.length || 0}`)
                        } else if (m.role === 'system') {
                            console.log(`  [${idx}] system: content_length=${m.content?.length || 0}`)
                        } else {
                            console.log(`  [${idx}] ${m.role}: content_type=${Array.isArray(m.content) ? 'array' : typeof m.content}`)
                        }
                    })
                }
            } catch (e) {
                console.error('[MiniMax Request] Error parsing body:', e)
            }
        }

        const response = await baseFetch(input, init)

        if (!validationProbe || !response.ok) {
            return response
        }

        const contentType = response.headers.get("content-type") || ""
        if (!contentType.includes("application/json")) {
            return response
        }

        const clonedResponse = response.clone()
        const parsedResponse = await clonedResponse
            .json()
            .catch(() => undefined)

        if (!isSuccessOnlyValidationResponse(parsedResponse)) {
            return response
        }

        const headers = new Headers(response.headers)
        headers.set("content-type", "application/json")
        headers.set("x-openai-compat-validation", "synthetic")

        return new Response(
            createSyntheticValidationResponse(validationProbe.model),
            {
                status: response.status,
                statusText: response.statusText,
                headers,
            },
        )
    }
}
