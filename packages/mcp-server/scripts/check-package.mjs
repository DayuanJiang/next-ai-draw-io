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
]
// The bundled draw.io is most of the package; a jump means the file list
// grew more than intended
const MAX_TARBALL_BYTES = 40 * 1024 * 1024

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
if (pack.size > MAX_TARBALL_BYTES) {
    console.error(
        `npm package is ${mb(pack.size)} MB packed, over the ${mb(MAX_TARBALL_BYTES)} MB limit`,
    )
    process.exit(1)
}
console.log(
    `npm package OK (${files.size} files, ${mb(pack.size)} MB packed, ${mb(pack.unpackedSize)} MB unpacked)`,
)
