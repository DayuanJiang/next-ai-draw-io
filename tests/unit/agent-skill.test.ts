import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// The agent skill that `npx skills add DayuanJiang/next-ai-draw-io` installs
const SKILL_PATH = "skills/next-ai-drawio/SKILL.md"
const read = (path: string) => readFileSync(path, "utf8")
const skill = read(SKILL_PATH)
const [, frontmatter = "", body = ""] =
    skill.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/) ?? []
const field = (key: string) =>
    frontmatter.match(new RegExp(`^${key}: (.*)$`, "m"))?.[1] ?? ""
const codeSpans = [...body.matchAll(/`([^`]+)`/g)].map((m) => m[1])

describe("agent skill", () => {
    it("has the frontmatter the skills CLI and agents require", () => {
        // Agent Skills spec: lowercase name that matches its folder,
        // description of at most 1024 characters
        expect(field("name")).toBe("next-ai-drawio")
        expect(field("description").length).toBeGreaterThan(0)
        expect(field("description").length).toBeLessThanOrEqual(1024)
    })

    it("uses the install commands from the MCP server README", () => {
        const readme = read("packages/mcp-server/README.md")
        const commands = codeSpans.filter((s) =>
            /^(claude|codex) mcp add /.test(s),
        )
        expect(commands).toHaveLength(2)
        for (const command of commands) expect(readme).toContain(command)

        const configs = codeSpans.filter((s) => s.startsWith("{"))
        expect(configs).toHaveLength(2)
        for (const config of configs) {
            const parsed = JSON.parse(config)
            const server = (parsed.servers ?? parsed.mcpServers).drawio
            expect(server.command).toBe("npx")
            expect(server.args).toEqual(["@next-ai-drawio/mcp-server@latest"])
        }
    })

    it("names only tools the MCP server registers", () => {
        const index = read("packages/mcp-server/src/index.ts")
        const tools = codeSpans.filter((s) =>
            /^(start|create|edit|get|load|export|screenshot|restore)_[a-z_]+$/.test(
                s,
            ),
        )
        expect(tools.length).toBeGreaterThan(5)
        for (const tool of tools) expect(index, tool).toContain(`"${tool}"`)
    })
})
