// @vitest-environment node
import { parseJsonEventStream, zodSchema } from "ai"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { z } from "zod"
import { withHeartbeat } from "@/lib/stream-heartbeat"

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const encode = (s: string) => new TextEncoder().encode(s)

/** A response whose body the test writes to, wrapped, and its text so far */
function setup() {
    let source!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({
        start: (c) => {
            source = c
        },
    })
    const response = withHeartbeat(
        new Response(body, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
        }),
        20_000,
    )
    const reader = (response.body as ReadableStream<Uint8Array>).getReader()
    let text = ""
    const pump = (async () => {
        for (;;) {
            const { done, value } = await reader.read()
            if (done) return
            text += new TextDecoder().decode(value)
        }
    })()
    return { response, source, reader, pump, text: () => text }
}

it("writes a comment when the stream is quiet, and passes events through", async () => {
    const { response, source, pump, text } = setup()
    expect(response.headers.get("content-type")).toBe("text/event-stream")
    source.enqueue(encode('data: {"type":"start"}\n\n'))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(text()).toBe('data: {"type":"start"}\n\n')
    await vi.advanceTimersByTimeAsync(15_000)
    expect(text()).toBe('data: {"type":"start"}\n\n: keep-alive\n\n')
    source.enqueue(encode('data: {"type":"finish"}\n\n'))
    source.close()
    await pump
    expect(text()).toBe(
        'data: {"type":"start"}\n\n: keep-alive\n\ndata: {"type":"finish"}\n\n',
    )
    expect(vi.getTimerCount()).toBe(0)
})

it("is skipped by the SDK's stream parser", async () => {
    vi.useRealTimers()
    const body = new Response(
        'data: {"type":"start"}\n\n: keep-alive\n\ndata: {"type":"finish"}\n\n',
    ).body
    const types: string[] = []
    const events = parseJsonEventStream({
        stream: body as ReadableStream<Uint8Array>,
        schema: zodSchema(z.object({ type: z.string() })),
    })
    const reader = events.getReader()
    for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (value.success) types.push(value.value.type)
    }
    expect(types).toEqual(["start", "finish"])
})

it("never writes a comment inside an event split across chunks", async () => {
    const { source, pump, text } = setup()
    source.enqueue(encode('data: {"type":'))
    await vi.advanceTimersByTimeAsync(60_000)
    source.enqueue(encode('"finish"}\n\n'))
    source.close()
    await pump
    expect(text()).toBe('data: {"type":"finish"}\n\n')
})

it("stops when the client goes", async () => {
    const { reader } = setup()
    await reader.cancel()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(vi.getTimerCount()).toBe(0)
})
