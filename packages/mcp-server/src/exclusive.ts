/**
 * A queue for tool handlers: each call waits until the previous one ended.
 * A tool call the client cancelled while it waited (the MCP SDK aborts its
 * extra.signal, the handler's last argument) is skipped.
 */
export function createExclusive() {
    let tail: Promise<unknown> = Promise.resolve()
    return function exclusive<T extends (...args: any[]) => Promise<unknown>>(
        handler: T,
    ): T {
        return ((...args: unknown[]) => {
            const extra = args.at(-1) as { signal?: AbortSignal } | undefined
            const run = tail.then(() =>
                extra?.signal?.aborted
                    ? {
                          content: [{ type: "text", text: "Cancelled." }],
                          isError: true,
                      }
                    : handler(...args),
            )
            tail = run.catch(() => {})
            return run
        }) as T
    }
}
