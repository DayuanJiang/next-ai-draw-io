const PING = new TextEncoder().encode(": keep-alive\n\n")

/**
 * The response with an SSE comment written whenever it has sent nothing for
 * `quietMs`. Some providers send a tool call's input only once it is
 * complete, so a big diagram can leave the stream silent for minutes, and
 * proxies close a response that sends nothing for a while (Cloudflare after
 * 125 s, a load balancer after its idle timeout). The SDK's parser skips
 * comment lines.
 */
export function withHeartbeat(response: Response, quietMs = 20_000): Response {
    if (!response.body) return response
    let timer: ReturnType<typeof setInterval> | undefined
    let lastSent = Date.now()
    // Pings go only between events, never inside one split across chunks
    let atEventEnd = true
    const body = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
            start(controller) {
                timer = setInterval(() => {
                    if (!atEventEnd || Date.now() - lastSent < quietMs) return
                    lastSent = Date.now()
                    try {
                        controller.enqueue(PING)
                    } catch {
                        // The client went: the stream is cancelled
                        clearInterval(timer)
                    }
                }, quietMs / 4)
            },
            transform(chunk, controller) {
                lastSent = Date.now()
                const n = chunk.length
                atEventEnd =
                    n >= 2 && chunk[n - 1] === 10 && chunk[n - 2] === 10
                controller.enqueue(chunk)
            },
            flush() {
                clearInterval(timer)
            },
        }),
    )
    return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    })
}
