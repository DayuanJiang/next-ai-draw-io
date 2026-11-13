import { getApiEndpoint } from "@/lib/base-path"
import { siteConfig } from "@/lib/site-config"
import {
    type Action,
    flushActions,
    noteAction,
    setActionSender,
} from "@/lib/user-actions"

/**
 * The web app's usage log: on a server that keeps one (Langfuse is set up),
 * the names of what the user does in the editor go to /api/log-actions, in
 * the chat's session, to see how the app is used.
 */
let started = false

/**
 * Called when the editor opens, once per page load: notes it, and sends the
 * actions from then on when the server keeps a usage log. They go when the
 * page is hidden or left, when another chat opens, and every 30 actions.
 */
export function startUsageLog() {
    if (started) return
    started = true
    noteAction("page open")
    void siteConfig().then((config) => {
        if (!config.usageLog) return
        setActionSender(postActions)
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") flushActions()
        })
        // Safari does not always report a closed tab as hidden
        window.addEventListener("pagehide", flushActions)
    })
}

function postActions(actions: Action[], sessionId?: string) {
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
