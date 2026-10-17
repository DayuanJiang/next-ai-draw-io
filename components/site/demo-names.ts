// The demos a docs file can show with a line "<!-- demo: name -->". Kept here,
// apart from the client modules (which would give the server only a
// reference) and from the texts (which need the server's dictionaries).

/** The editor demo's steps, by name */
export const DEMO_SCENES: Record<string, number> = {
    generate: 0,
    "hand-edit": 1,
    "ai-edit": 2,
    versions: 3,
}

/** Every name: the steps, the whole tour, the flowchart and the MCP terminal */
export const DOC_DEMOS = [
    ...Object.keys(DEMO_SCENES),
    "tour",
    "flowchart",
    "mcp",
]

/** The line that shows a demo, with the demo's name as its group */
export const DEMO_LINE = /^<!--\s*demo:\s*([a-z-]+)\s*-->[ \t]*$/gm
