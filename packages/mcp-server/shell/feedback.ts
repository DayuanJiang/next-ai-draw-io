import type { ShellConfig } from "./runtime-config"

const ISSUES_URL = "https://github.com/DayuanJiang/next-ai-draw-io/issues/new"

/**
 * A new GitHub issue about the MCP server with the environment filled in.
 * The server sends nothing anywhere, so this is the way to tell us.
 */
export function feedbackIssueUrl(
    config: ShellConfig,
    userAgent: string,
): string {
    const drawio = config.drawioBaseUrl.startsWith("/")
        ? "bundled copy"
        : config.drawioBaseUrl
    const body = [
        "## What happened",
        "",
        "",
        "## What you expected",
        "",
        "",
        "## Environment",
        `- MCP server: ${config.version || "unknown"}`,
        "- MCP client (Claude Code, Cursor, Codex, VS Code...): ",
        `- draw.io: ${drawio}`,
        `- Browser: ${userAgent}`,
    ].join("\n")
    return `${ISSUES_URL}?${new URLSearchParams({ title: "[MCP] ", body })}`
}
