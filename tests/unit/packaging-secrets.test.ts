// @vitest-environment node
/**
 * The admin panel saves API keys to data/settings.json in the project
 * folder, and Next copies that file into .next/standalone. A Docker image or
 * a desktop installer built on that machine must not carry it.
 */
import { execFileSync } from "node:child_process"
import {
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()

describe("the builder's saved API keys", () => {
    it("stay out of the Docker build context", () => {
        const ignored = readFileSync(path.join(root, ".dockerignore"), "utf8")
        expect(ignored.split("\n")).toContain("data")
    })

    it("stay out of the desktop app's server folder", () => {
        // A project folder after `next build`, with the script that
        // prepares the folder electron-builder packs
        const project = mkdtempSync(path.join(tmpdir(), "prepare-"))
        const file = (name: string, text = "") => {
            mkdirSync(path.dirname(path.join(project, name)), {
                recursive: true,
            })
            writeFileSync(path.join(project, name), text)
        }
        file(".next/standalone/server.js")
        file(".next/standalone/.env", "OPENAI_API_KEY=sk-env")
        file(".next/standalone/data/settings.json", "sk-saved")
        file(".next/static/chunk.js")
        file("public/favicon.ico")
        cpSync(path.join(root, "scripts"), path.join(project, "scripts"), {
            recursive: true,
        })

        execFileSync("node", ["scripts/prepare-electron-build.mjs"], {
            cwd: project,
            stdio: "pipe",
        })

        const packed = path.join(project, "electron-standalone")
        expect(existsSync(path.join(packed, "server.js"))).toBe(true)
        expect(existsSync(path.join(packed, ".env"))).toBe(false)
        expect(existsSync(path.join(packed, "data"))).toBe(false)
    })
})
