/**
 * drawio-files.txt: the files copied from draw.war into dist/drawio.
 *
 * One path per line; `*` matches within a path segment and `**` across
 * segments; `#` starts a comment. Everything above the marker line is kept
 * as it is ("always include"); the paths below it are what the embedded
 * editor requested in a guard run, rewritten by check-drawio-files.mjs
 * --update.
 */
import fs from "node:fs"

export const MARKER =
    "# Requested by the editor; rewritten by scripts/check-drawio-files.mjs --update"

function toRegExp(pattern) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    const source = escaped
        .replace(/\*\*/g, "\0")
        .replace(/\*/g, "[^/]*")
        .replace(/\0/g, ".*")
    return new RegExp(`^${source}$`)
}

const entries = (text) =>
    text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))

export function parseFileList(text) {
    const at = text.indexOf(MARKER)
    if (at < 0) throw new Error(`drawio-files.txt has no "${MARKER}" line`)
    const head = text.slice(0, at + MARKER.length)
    const always = entries(head)
    const requested = entries(text.slice(at + MARKER.length))

    const exact = new Set()
    const patterns = []
    for (const entry of [...always, ...requested]) {
        if (entry.includes("*")) {
            patterns.push({ text: entry, re: toRegExp(entry), hit: false })
        } else {
            exact.add(entry)
        }
    }

    return {
        head,
        always,
        requested,
        /** Whether the list names this file (remembers which patterns hit) */
        matches(name) {
            if (exact.has(name)) return true
            let found = false
            for (const p of patterns) {
                if (p.re.test(name)) p.hit = found = true
            }
            return found
        },
        /** Entries that matched none of `seen` after matches() ran on them */
        unmatched(seen) {
            return [
                ...[...exact].filter((name) => !seen.has(name)),
                ...patterns.filter((p) => !p.hit).map((p) => p.text),
            ]
        },
    }
}

export function readFileList(file) {
    return parseFileList(fs.readFileSync(file, "utf8"))
}

/** The list text with a new requested section (sorted, unique) */
export function formatFileList(head, requested) {
    const body = [...new Set(requested)].sort().join("\n")
    return `${head}\n${body}\n`
}
