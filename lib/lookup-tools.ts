/**
 * The chat tools that only look something up for the model (lib/chat-tools.ts
 * runs them on the server). A call of one of them draws nothing, and the
 * model goes on to draw with what it returned. Kept apart from the tool
 * definitions, which need the server's file system, so the browser can ask.
 */
const LOOKUP_TOOLS = new Set(["get_shape_library", "get_diagram_guide"])

export const isLookupTool = (name: string) => LOOKUP_TOOLS.has(name)
