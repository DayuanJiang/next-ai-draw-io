// Build the canvas shell (shell/, the web app's canvas without the chat)
// into dist/shell: shell.js with esbuild, shell.css with Tailwind, and the
// page template. Needs the repository checked out with its root
// devDependencies installed (esbuild, Tailwind, React and the shared
// components come from there), like copy-assets.mjs needs ../../docs.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const pkg = join(dirname(fileURLToPath(import.meta.url)), "..")
const root = join(pkg, "../..")
const shell = join(pkg, "shell")
const out = join(pkg, "dist/shell")

// The root's copies: the shell's React must be the one the shared
// components import, and the MCP core's pako and saxes should not be
// bundled twice (packages/mcp-server has its own node_modules)
const rootRequire = createRequire(join(root, "package.json"))
const rootPackage = (name) =>
    dirname(rootRequire.resolve(`${name}/package.json`))
const { build } = await import(rootRequire.resolve("esbuild"))
const postcss = (await import(rootRequire.resolve("postcss"))).default
const tailwindcss = (await import(rootRequire.resolve("@tailwindcss/postcss")))
    .default

mkdirSync(out, { recursive: true })

const result = await build({
    entryPoints: [join(shell, "main.tsx")],
    outfile: join(out, "shell.js"),
    bundle: true,
    minify: true,
    format: "esm",
    target: "es2022",
    platform: "browser",
    jsx: "automatic",
    metafile: true,
    absWorkingDir: root,
    alias: {
        "@": root,
        pako: rootPackage("pako"),
        saxes: rootPackage("saxes"),
    },
    define: {
        "process.env.NODE_ENV": '"production"',
        // The shell has no base path and takes its draw.io from the config
        // the server writes into the page, not from the web app's build
        // settings
        "process.env.NEXT_PUBLIC_BASE_PATH": '""',
        "process.env.NEXT_PUBLIC_DRAWIO_BASE_URL": '""',
    },
})
const js = readFileSync(join(out, "shell.js"), "utf8")
// A reference that the defines above missed would throw in the browser
// ("process is not defined")
const leftover = js.match(/process\.env\.[A-Z_]+/)
if (leftover) {
    throw new Error(`shell.js still reads ${leftover[0]}; define it above`)
}

const cssFile = join(shell, "shell.css")
const css = await postcss([
    // Tailwind scans the shell directory on its own; shell.css names the
    // shared component directories with @source
    tailwindcss({ base: shell, optimize: { minify: true } }),
]).process(readFileSync(cssFile, "utf8"), {
    from: cssFile,
    to: join(out, "shell.css"),
})
writeFileSync(join(out, "shell.css"), css.css)

cpSync(join(shell, "index.html"), join(out, "index.html"))

const kb = (n) => `${(n / 1024).toFixed(0)} KB`
const bundled = Object.values(result.metafile.outputs).find((o) => o.entryPoint)
console.log(
    `shell: shell.js ${kb(bundled.bytes)}, shell.css ${kb(Buffer.byteLength(css.css))} -> ${out}`,
)
