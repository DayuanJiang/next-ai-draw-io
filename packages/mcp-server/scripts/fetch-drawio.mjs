#!/usr/bin/env node
/**
 * Build step: put a trimmed copy of draw.io into dist/drawio, so the preview
 * page can embed the editor from its own origin (same-origin editor access,
 * and no internet needed at runtime).
 *
 * Downloads the pinned draw.war (see src/drawio-version.json) into a cache
 * directory (DRAWIO_WAR_CACHE, default <tmpdir>/next-ai-drawio), checks its
 * SHA-256, and extracts only the files listed in drawio-files.txt. Set
 * DRAWIO_WAR=<path> to use a local war without downloading. The list is kept
 * up to date by scripts/check-drawio-files.mjs.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
    readDrawioVersion,
    readZipEntries,
    sha256,
} from "../../../scripts/drawio-zip.mjs"
import { readFileList } from "./drawio-file-list.mjs"

const PKG = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const DEST = path.join(PKG, "dist/drawio")
const { version, sha256: expectedSha, downloadUrl } = readDrawioVersion()

function log(message) {
    console.log(`[fetch-drawio] ${message}`)
}

/** The draw.war as a buffer, from DRAWIO_WAR, the cache, or GitHub */
async function readWar() {
    const verified = (buf, source) => {
        const actual = sha256(buf)
        if (actual !== expectedSha) {
            throw new Error(
                `${source} is not draw.io ${version} (SHA-256 ${actual})`,
            )
        }
        return buf
    }

    if (process.env.DRAWIO_WAR) {
        log(`Using ${process.env.DRAWIO_WAR}`)
        return verified(fs.readFileSync(process.env.DRAWIO_WAR), "DRAWIO_WAR")
    }

    const cacheDir =
        process.env.DRAWIO_WAR_CACHE || path.join(os.tmpdir(), "next-ai-drawio")
    const cached = path.join(cacheDir, `draw-${version}.war`)
    if (fs.existsSync(cached)) {
        try {
            return verified(fs.readFileSync(cached), cached)
        } catch (error) {
            log(`${error.message}; downloading again`)
            fs.rmSync(cached, { force: true })
        }
    }

    log(`Downloading draw.io ${version} ...`)
    const res = await fetch(downloadUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${downloadUrl}`)
    const buf = verified(Buffer.from(await res.arrayBuffer()), downloadUrl)
    fs.mkdirSync(cacheDir, { recursive: true })
    const tmp = `${cached}.tmp-${process.pid}`
    fs.writeFileSync(tmp, buf)
    fs.renameSync(tmp, cached)
    log(`Cached at ${cached}`)
    return buf
}

/** Apache-2.0 text with a notice naming draw.io, for dist/drawio/LICENSE */
function licenseText(warLicense) {
    const notice =
        `The files in this directory are an unmodified subset of draw.io ${version}\n` +
        "(https://github.com/jgraph/drawio), Copyright (c) JGraph Ltd, redistributed\n" +
        "under the Apache License, Version 2.0 reproduced below. The icon sets under\n" +
        "img/lib and the stencils built into the scripts have additional terms, see\n" +
        "img/LICENSE, shapes/LICENSE and stencils/LICENSE.\n\n"
    if (warLicense) return notice + warLicense
    // The standard terms, without this project's own copyright notice
    const apache = fs.readFileSync(path.join(PKG, "../../LICENSE"), "utf8")
    const end = "END OF TERMS AND CONDITIONS"
    return notice + apache.slice(0, apache.indexOf(end) + end.length) + "\n"
}

async function main() {
    const list = readFileList(path.join(PKG, "drawio-files.txt"))
    const buf = await readWar()

    const tmp = `${DEST}.tmp-${process.pid}`
    fs.rmSync(tmp, { recursive: true, force: true })
    const written = new Set()
    let bytes = 0
    let warLicense = null
    for (const { name, data } of readZipEntries(buf)) {
        // Server-side parts of the war; never shipped, whatever the list says
        if (/^(WEB-INF|META-INF)\//.test(name)) continue
        if (name === "LICENSE") warLicense = data.toString("utf8")
        if (!list.matches(name)) continue
        const target = path.join(tmp, name)
        if (!target.startsWith(tmp + path.sep)) {
            throw new Error(`Unsafe path in archive: ${name}`)
        }
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, data)
        written.add(name)
        bytes += data.length
    }

    const missing = list.unmatched(written)
    if (missing.length > 0) {
        throw new Error(
            `drawio-files.txt names files that draw.io ${version} does not have:\n  ${missing.join("\n  ")}\n` +
                "Run scripts/check-drawio-files.mjs --update to refresh the list.",
        )
    }

    fs.writeFileSync(path.join(tmp, "LICENSE"), licenseText(warLicense))
    fs.writeFileSync(path.join(tmp, ".version"), `${version}\n`)
    fs.rmSync(DEST, { recursive: true, force: true })
    fs.renameSync(tmp, DEST)
    log(
        `Installed ${written.size} files (${(bytes / 1048576).toFixed(1)} MB) into dist/drawio`,
    )
}

main().catch((error) => {
    console.error(`[fetch-drawio] ${error.stack || error}`)
    process.exit(1)
})
