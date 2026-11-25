const projectionKey = "@next-ai-drawio/dsh:canvas"
const startTool = "mcp__drawio__start_session"
const sessionId = "mcp-[a-z0-9-]{1,64}"
const localPreview = new RegExp(
    `^http://(?:localhost|127\\.0\\.0\\.1|\\[::1\\]):[1-9]\\d{0,4}(?:/shell/|/)?\\?mcp=(${sessionId})$`,
)
const activeHeader = new RegExp(
    `^Session (${sessionId}) is already active:[^\\r\\n]*\\r?\\n\\r?\\nBrowser URL: (\\S+)`,
)
const newHeader = new RegExp(
    `^(?:Session started successfully!|No saved diagram for ${sessionId}; starting blank\\.)\\r?\\n\\r?\\nSession ID: (${sessionId})\\r?\\nBrowser URL: (\\S+)`,
)
const resumedHeader = new RegExp(`^Resumed session (${sessionId})\\.`)
const resumedDetails = new RegExp(
    `\\r?\\nCall get_diagram before edit_diagram\\.\\r?\\n\\r?\\nSession ID: (${sessionId})\\r?\\nBrowser URL: (\\S+)`,
)

function isSequence(value) {
    return Number.isSafeInteger(value) && value >= 0
}

function isLocalPreview(value) {
    if (typeof value !== "string" || !localPreview.test(value)) return false
    try {
        new URL(value)
        return true
    } catch {
        return false
    }
}

// Session projections accept wire and checkpoint schemas with a parse method.
const canvasSchema = {
    parse(value) {
        if (value === null) return null
        if (
            !isSequence(value?.seq) ||
            !isLocalPreview(value.url) ||
            typeof value.reveal !== "boolean"
        ) {
            throw new TypeError("Invalid Draw.io canvas projection")
        }
        return { url: value.url, seq: value.seq, reveal: value.reveal }
    },
}
const stateSchema = {
    parse(value) {
        if (
            !isSequence(value?.firstOwnSeq) ||
            !Array.isArray(value.pending) ||
            value.pending.some((id) => typeof id !== "string")
        ) {
            throw new TypeError("Invalid Draw.io canvas checkpoint")
        }
        return {
            firstOwnSeq: value.firstOwnSeq,
            pending: [...value.pending],
            canvas: canvasSchema.parse(value.canvas),
        }
    },
}

function previewUrl(content) {
    for (const block of content) {
        if (block.type !== "text") continue
        const header = block.text.slice(0, 16_384)
        const match = activeHeader.exec(header) ?? newHeader.exec(header)
        if (match) {
            const [, id, url] = match
            if (isLocalPreview(url) && localPreview.exec(url)?.[1] === id)
                return url
            continue
        }
        const resumedId = resumedHeader.exec(header)?.[1]
        if (!resumedId) continue
        // Older resume responses list diagram names before the real URL. A
        // diagram name can contain a fake header, so reject ambiguous responses.
        // Count over the whole result so a large diagram cannot hide the real URL.
        const urls = /^Browser URL: /gm
        if (!urls.test(block.text) || urls.test(block.text)) continue
        const resumed = resumedDetails.exec(block.text)
        if (resumed?.[1] !== resumedId) continue
        const url = resumed[2]
        if (isLocalPreview(url) && localPreview.exec(url)?.[1] === resumedId)
            return url
    }
    return null
}

function acceptPreview(state, event, content) {
    const url = previewUrl(content)
    return url === null
        ? state
        : { ...state, canvas: { url, seq: event.seq, reveal: true } }
}

function fold(state, event) {
    // The inherited transcript of a fork may refer to the original canvas.
    if (event.seq < state.firstOwnSeq) return state
    const { data } = event
    switch (event.type) {
        case "tool/call":
            return data.name === startTool
                ? { ...state, pending: [...state.pending, data.callId] }
                : state
        case "tool/result": {
            const { message } = data
            if (!state.pending.includes(message.toolCallId)) return state
            const next = {
                ...state,
                pending: state.pending.filter(
                    (id) => id !== message.toolCallId,
                ),
            }
            return message.isError || data.error
                ? next
                : acceptPreview(next, event, message.content)
        }
        case "tool/ptc-dispatch":
            return data.name === startTool && !data.isError && !data.error
                ? acceptPreview(state, event, data.content)
                : state
        case "turn/end":
            if (!state.pending.length && !state.canvas?.reveal) return state
            return {
                ...state,
                pending: [],
                canvas: state.canvas && { ...state.canvas, reveal: false },
            }
        default:
            return state
    }
}

export const inject = ["sessionProjections"]

export async function apply(ctx) {
    await ctx.sessionProjections.register({
        key: projectionKey,
        stateVersion: 1,
        stateSchema,
        init: (_header, inheritedEventCount) => ({
            firstOwnSeq: inheritedEventCount,
            pending: [],
            canvas: null,
        }),
        apply: fold,
        wire: {
            viewSchema: canvasSchema,
            view: (state) => state.canvas,
            summary: false,
        },
    })
}
