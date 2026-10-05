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
]

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
console.log(`npm package OK (${files.size} files)`)
