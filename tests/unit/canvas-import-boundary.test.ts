// @vitest-environment node
/**
 * The canvas modules are reused by the MCP server's browser shell, which
 * has no chat and no Next.js. They must not import the chat, the tool
 * handlers, Next-only modules or server-only code. Checked twice: the
 * import statements of each file, and what esbuild pulls into a bundle of
 * the canvas components.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { build } from "esbuild"
import { describe, expect, it } from "vitest"

const root = process.cwd()

const SCANNED = [
    "components/canvas",
    "contexts/diagram-context.tsx",
    "lib/drawio",
    "lib/diagram-pages.ts",
    "lib/diagram-diff.ts",
    "stores/canvas-store.ts",
    "stores/versions-store.ts",
]

const FORBIDDEN = [
    /^@\/components\/chat\//,
    /^@\/hooks\/use-diagram-tool-handlers/,
    /^next\/navigation$/,
    /^next\/font(\/|$)/,
    /^next\/script$/,
    /^next\/headers$/,
    /^server-only$/,
]

function listFiles(entry: string): string[] {
    const full = path.join(root, entry)
    if (statSync(full).isFile()) return [entry]
    return readdirSync(full, { recursive: true })
        .map(String)
        .filter((name) => /\.tsx?$/.test(name))
        .map((name) => path.join(entry, name))
}

/** Module specifiers a file imports at runtime (type-only imports do not
 * reach a bundle) */
function valueImports(source: string): string[] {
    const code = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
    const specifiers: string[] = []
    const statements =
        /(?:^|\n)\s*(import|export)\s+([\s\S]*?)\s*from\s*["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g
    for (const match of code.matchAll(statements)) {
        const [, keyword, clause, from, bare, dynamic] = match
        if (keyword && /^type\s/.test(clause)) continue
        specifiers.push(from ?? bare ?? dynamic)
    }
    return specifiers
}

/** The file an "@/..." or relative specifier points at, when it is one of
 * ours */
function resolveLocal(fromFile: string, specifier: string): string | null {
    let base: string
    if (specifier.startsWith("@/")) base = path.join(root, specifier.slice(2))
    else if (specifier.startsWith(".")) {
        base = path.resolve(root, path.dirname(fromFile), specifier)
    } else return null
    for (const candidate of [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        path.join(base, "index.ts"),
        path.join(base, "index.tsx"),
    ]) {
        if (existsSync(candidate) && statSync(candidate).isFile()) {
            return path.relative(root, candidate)
        }
    }
    return null
}

const isServerOnly = (file: string) =>
    /^\s*import\s+["']server-only["']/m.test(
        readFileSync(path.join(root, file), "utf8"),
    )

describe("canvas import boundary", () => {
    const files = SCANNED.flatMap(listFiles)

    it("scans the canvas modules", () => {
        expect(files).toContain("components/canvas/canvas-stage.tsx")
        expect(files).toContain("lib/drawio/editor-bridge.ts")
    })

    it.each(files)("%s imports no chat or Next-only module", (file) => {
        const source = readFileSync(path.join(root, file), "utf8")
        const offending = valueImports(source).filter((specifier) => {
            if (FORBIDDEN.some((rule) => rule.test(specifier))) return true
            const target = resolveLocal(file, specifier)
            if (!target) return false
            return target.startsWith("components/chat/") || isServerOnly(target)
        })
        expect(offending).toEqual([])
    })

    it("bundles the canvas components without the chat", async () => {
        const result = await build({
            entryPoints: [
                "components/canvas/canvas-stage.tsx",
                "components/canvas/compare-dialog.tsx",
                "components/canvas/version-card.tsx",
                "components/canvas/version-strip.tsx",
            ],
            absWorkingDir: root,
            // Several entries need an outdir, even when nothing is written
            outdir: "out",
            bundle: true,
            write: false,
            metafile: true,
            platform: "browser",
            format: "esm",
            jsx: "automatic",
            alias: { "@": root },
            external: ["react", "react-dom", "next/*"],
            logLevel: "silent",
        })
        const inputs = result.metafile.inputs
        const bundled = Object.keys(inputs)
        expect(bundled.length).toBeGreaterThan(10)
        expect(
            bundled.filter(
                (file) =>
                    file.startsWith("components/chat/") ||
                    file.includes("node_modules/server-only/"),
            ),
        ).toEqual([])
        const nextImports = Object.entries(inputs).flatMap(([file, input]) =>
            input.imports
                .map((entry) => entry.path)
                .filter((specifier) =>
                    FORBIDDEN.some((rule) => rule.test(specifier)),
                )
                .map((specifier) => `${file} -> ${specifier}`),
        )
        expect(nextImports).toEqual([])
    })
})
