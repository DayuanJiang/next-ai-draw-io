import { getApiEndpoint } from "@/lib/base-path"
import { siteConfig } from "@/lib/site-config"
import { STORAGE_KEYS } from "@/lib/storage"

/**
 * What the user did in the editor, as names ("send", "export png"). A name
 * must never hold what the user typed or drew. The last few go with every
 * error report. A server that keeps a usage log (Langfuse is set up) gets
 * all of them, in the chat's session, to see how the app is used.
 */
interface Action {
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
let started = false
let logging = false

/** Notes something the user did (or an answer ended) */
export function noteAction(name: string) {
    const action = { name, at: Date.now() }
    recent.push(action)
    if (recent.length > MAX_RECENT) recent.shift()
    // Another chat since the last action: what is waiting was the old one's
    const session = chatSessionId()
    if (pendingSession && session !== pendingSession) sendActions()
    pendingSession = session
    pending.push(action)
    if (pending.length >= MAX_PENDING) sendActions()
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

/**
 * Called when the editor opens, once per page load: notes it, and sends the
 * actions from then on when the server keeps a usage log. They go when the
 * page is hidden or left, and every MAX_PENDING actions.
 */
export function startUsageLog() {
    if (started) return
    started = true
    noteAction("page open")
    void siteConfig().then((config) => {
        if (!config.usageLog) return
        logging = true
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") sendActions()
        })
        // Safari does not always report a closed tab as hidden
        window.addEventListener("pagehide", sendActions)
    })
}

function sendActions() {
    const actions = pending
    const sessionId = pendingSession ?? chatSessionId()
    pending = []
    if (!logging || actions.length === 0) return
    const now = Date.now()
    fetch(getApiEndpoint("/api/log-actions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Still sent when the page is closing
        keepalive: true,
        body: JSON.stringify({
            // How long ago each was, for the server to time them by its
            // own clock: the user's may be wrong
            actions: actions.map((a) => ({ name: a.name, ago: now - a.at })),
            page: location.pathname.slice(0, 500),
            version: process.env.APP_VERSION,
            sessionId,
        }),
    }).catch(() => {})
}
