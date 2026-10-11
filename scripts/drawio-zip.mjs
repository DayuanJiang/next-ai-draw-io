/**
 * Shared by the two draw.io fetch scripts (the web app's scripts/fetch-drawio.mjs
 * and packages/mcp-server/scripts/fetch-drawio.mjs): the pinned release and a
 * minimal reader for its draw.war zip file, so no extra dependency is needed.
 */
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import zlib from "node:zlib"

// Pinned because the UI relies on draw.io internals; bump deliberately. The
// web app and the MCP server embed the same release.
const VERSION_FILE = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../packages/mcp-server/src/drawio-version.json",
)

/** { version, sha256, downloadUrl } of the pinned draw.war */
export function readDrawioVersion() {
    return JSON.parse(fs.readFileSync(VERSION_FILE, "utf8"))
}

export function sha256(buf) {
    return crypto.createHash("sha256").update(buf).digest("hex")
}

// Minimal zip reader: finds the central directory and inflates each entry
export function* readZipEntries(buf) {
    const EOCD_SIG = 0x06054b50
    let eocd = -1
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
        if (buf.readUInt32LE(i) === EOCD_SIG) {
            eocd = i
            break
        }
    }
    if (eocd < 0) throw new Error("Not a zip file (end record not found)")

    const count = buf.readUInt16LE(eocd + 10)
    let offset = buf.readUInt32LE(eocd + 16)

    for (let n = 0; n < count; n++) {
        if (buf.readUInt32LE(offset) !== 0x02014b50) {
            throw new Error("Corrupt zip central directory")
        }
        const method = buf.readUInt16LE(offset + 10)
        const compressedSize = buf.readUInt32LE(offset + 20)
        const nameLength = buf.readUInt16LE(offset + 28)
        const extraLength = buf.readUInt16LE(offset + 30)
        const commentLength = buf.readUInt16LE(offset + 32)
        const localOffset = buf.readUInt32LE(offset + 42)
        const name = buf.toString("utf8", offset + 46, offset + 46 + nameLength)
        offset += 46 + nameLength + extraLength + commentLength

        const localNameLength = buf.readUInt16LE(localOffset + 26)
        const localExtraLength = buf.readUInt16LE(localOffset + 28)
        const start = localOffset + 30 + localNameLength + localExtraLength
        const raw = buf.subarray(start, start + compressedSize)

        if (name.endsWith("/")) continue
        if (method !== 0 && method !== 8) {
            throw new Error(`Unsupported zip compression ${method} (${name})`)
        }
        yield { name, data: method === 8 ? zlib.inflateRawSync(raw) : raw }
    }
}
