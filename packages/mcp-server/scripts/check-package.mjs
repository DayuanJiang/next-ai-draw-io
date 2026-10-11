// Fail if the npm package would miss files the server reads at runtime.
// Tests run from src/ (tsx) and cannot notice a broken dist/ copy step.
// Run after `npm run build`.
import { execSync } from "node:child_process"

const REQUIRED = [
    "dist/index.js",
    "dist/shape-libraries/aws4.md",
    "dist/preview/index.html",
    "dist/preview/preview.css",
    "dist/preview/preview.js",
    "dist/drawio/index.html",
    "dist/drawio/js/app.min.js",
    "dist/drawio/LICENSE",
    // The draw.io version stamp (part of every file's ETag); a dotfile, so
    // make sure npm keeps it
    "dist/drawio/.version",
    "dist/shell/index.html",
    "dist/shell/shell.js",
    "dist/shell/shell.css",
]
// The canvas shell (750 KB and 50 KB at version 0.4.0); a jump means a
// dependency of the shared components grew the bundle
const MAX_FILE_BYTES = {
    "dist/shell/shell.js": 1.5 * 1024 * 1024,
    "dist/shell/shell.css": 300 * 1024,
}
// The bundled draw.io is most of the package (15.3 MB packed with draw.io
// v32.0.2 at version 0.4.0); a jump means the file list grew more than
// intended
const MAX_TARBALL_BYTES = 20 * 1024 * 1024

const output = JSON.parse(
    execSync("npm pack --dry-run --json", { encoding: "utf8" }),
)
// npm 11 prints a list, npm 12 an object keyed by package name
const pack = Array.isArray(output) ? output[0] : Object.values(output)[0]
const files = new Set(pack.files.map((f) => f.path))
const missing = REQUIRED.filter((f) => !files.has(f))
if (missing.length > 0) {
    console.error(`npm package is missing: ${missing.join(", ")}`)
    process.exit(1)
}
const mb = (n) => (n / 1048576).toFixed(1)
const kb = (n) => (n / 1024).toFixed(0)
for (const [path, limit] of Object.entries(MAX_FILE_BYTES)) {
    const size = pack.files.find((f) => f.path === path).size
    if (size > limit) {
        console.error(
            `${path} is ${kb(size)} KB, over the ${kb(limit)} KB limit`,
        )
        process.exit(1)
    }
}
if (pack.size > MAX_TARBALL_BYTES) {
    console.error(
        `npm package is ${mb(pack.size)} MB packed, over the ${mb(MAX_TARBALL_BYTES)} MB limit`,
    )
    process.exit(1)
}
console.log(
    `npm package OK (${files.size} files, ${mb(pack.size)} MB packed, ${mb(pack.unpackedSize)} MB unpacked)`,
)
