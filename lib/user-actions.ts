import { STORAGE_KEYS } from "@/lib/storage"

/**
 * What the user did in the editor, as names ("send", "export png"). A name
 * must never hold what the user typed or drew. The last few go with every
 * error report. On a server that keeps a usage log, the web app's
 * lib/usage-log.ts takes all of them. The sending lives there, in a module
 * only the web app loads: the MCP server's canvas page shares the
 * components that note actions, and its bundle must hold no sending code.
 */
export interface Action {
    name: string
    at: number
}

// The last actions, for error reports: they show what led to the error
const MAX_RECENT = 10
const recent: Action[] = []
// The actions the usage log has not got yet, and the chat they happened in
const MAX_PENDING = 30
let pending: Action[] = []
let pendingSession: string | undefined
// Where the waiting actions go; without it they are dropped
let sender: ((actions: Action[], sessionId?: string) => void) | null = null

/** Notes something the user did (or an answer ended) */
export function noteAction(name: string) {
    const action = { name, at: Date.now() }
    recent.push(action)
    if (recent.length > MAX_RECENT) recent.shift()
    // Another chat since the last action: what is waiting was the old one's
    const session = chatSessionId()
    if (pendingSession && session !== pendingSession) flushActions()
    pendingSession = session
    pending.push(action)
    if (pending.length >= MAX_PENDING) flushActions()
}

/** Notes an action that comes in runs, once per run: every shape dragged
 * is an edit by hand */
export function noteActionOnce(name: string) {
    if (recent.at(-1)?.name !== name) noteAction(name)
}

/** The recent actions, oldest first, with how long ago each was */
export function recentActions(now = Date.now()): string[] {
    return recent.map(
        (a) => `${a.name} (${Math.round((now - a.at) / 1000)}s ago)`,
    )
}

/** The chat's Langfuse session, so reports and actions sit next to its
 * chat traces */
export function chatSessionId(): string | undefined {
    try {
        return localStorage.getItem(STORAGE_KEYS.sessionId) || undefined
    } catch {
        return undefined
    }
}

/** The usage log takes the waiting actions with this from now on */
export function setActionSender(send: typeof sender) {
    sender = send
}

/** Hands the waiting actions to the usage log, with the chat they happened
 * in */
export function flushActions() {
    const actions = pending
    pending = []
    if (actions.length > 0) sender?.(actions, pendingSession ?? chatSessionId())
}
