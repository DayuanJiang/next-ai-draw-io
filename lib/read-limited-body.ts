/**
 * Read a response body, giving up once it passes maxBytes, so a huge
 * download from a URL the client chose can't exhaust server memory.
 * Returns null when it is too large; the caller then aborts the request,
 * which ends the download.
 */
export async function readLimitedBody(
    response: Response,
    maxBytes: number,
): Promise<ArrayBuffer | null> {
    if (Number(response.headers.get("content-length")) > maxBytes) {
        return null
    }
    if (!response.body) return new ArrayBuffer(0)

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > maxBytes) {
            // Not awaited: a copy of the body that Next.js keeps (its fetch
            // dedupe) can hold the cancel back until it is read
            reader.cancel().catch(() => {})
            return null
        }
        chunks.push(value)
    }
    return new Blob(chunks as BlobPart[]).arrayBuffer()
}
