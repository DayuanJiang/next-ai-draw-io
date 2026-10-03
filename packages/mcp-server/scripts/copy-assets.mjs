// Copy non-TypeScript assets into dist/ after tsc, so they ship in the npm
// package ("files": ["dist"]).
import { cpSync, mkdirSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const pkg = join(dirname(fileURLToPath(import.meta.url)), "..")

// Shape library docs live at the repository root, shared with the web app
const libSrc = join(pkg, "../../docs/shape-libraries")
const libDest = join(pkg, "dist/shape-libraries")
mkdirSync(libDest, { recursive: true })
for (const file of readdirSync(libSrc)) {
    if (file.endsWith(".md") && file !== "README.md") {
        cpSync(join(libSrc, file), join(libDest, file))
    }
}

// Browser preview page (HTML, CSS and script)
cpSync(join(pkg, "src/preview"), join(pkg, "dist/preview"), {
    recursive: true,
})
