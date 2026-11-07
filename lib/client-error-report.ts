import { toast } from "sonner"
import { getApiEndpoint } from "@/lib/base-path"
import { STORAGE_KEYS } from "@/lib/storage"
import { useUiStore } from "@/stores/ui-store"

/**
 * Where a front-end error was seen: the crash page, an error nothing
 * caught, an error toast, or an error card in the chat
 */
export type ErrorKind = "crash" | "uncaught" | "toast" | "chat-error"

export interface ErrorReport {
    kind: ErrorKind
    message: string
    stack?: string
    /** What the user was doing, in their words; set on reports they send
     * (an empty note is a report sent without one) */
    note?: string
    /** A chat error's code (the provider's, or the app's own such as
     * "network") and the model the request went to */
    code?: string
    model?: string
}

const ENDPOINT = "/api/log-client-error"
const ISSUES_URL = "https://github.com/DayuanJiang/next-ai-draw-io/issues/new"
// Errors recorded without the user asking, per page load, and how much of
// each message
const MAX_AUTOMATIC = 5
const MAX_AUTOMATIC_MESSAGE = 500
// A stack line naming a file, line and column
const FRAME = /:\d+:\d+\)?\s*$/

let enabled: Promise<boolean> | undefined
const recorded = new Set<string>()
// The user's last actions, names only, sent with every report so it shows
// what led to the error
const MAX_ACTIONS = 10
const actions: { name: string; at: number }[] = []

/** Notes something the user did (or an answer ended), for the reports of
 * errors that follow. Names only, never what was typed or drawn. */
export function noteAction(name: string) {
    actions.push({ name, at: Date.now() })
    if (actions.length > MAX_ACTIONS) actions.shift()
}

/** The recent actions, oldest first, with how long ago each was */
export function recentActions(now = Date.now()): string[] {
    return actions.map(
        (a) => `${a.name} (${Math.round((now - a.at) / 1000)}s ago)`,
    )
}

/** Whether the server keeps reports (Langfuse is set up); asked once per
 * page load. Without it the page offers a GitHub issue instead. */
export function reportsEnabled(): Promise<boolean> {
    enabled ??= fetch(getApiEndpoint(ENDPOINT))
        .then((res) => res.json())
        .then((data) => data?.enabled === true)
        .catch(() => false)
    return enabled
}

/** Sends a report; true when the server kept it */
export async function sendErrorReport(report: ErrorReport): Promise<boolean> {
    try {
        const res = await fetch(getApiEndpoint(ENDPOINT), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // Still sent when the user reloads right after a crash
            keepalive: true,
            body: JSON.stringify({
                kind: report.kind,
                message: report.message.slice(0, 2000),
                stack: shortStack(report.stack)?.slice(0, 4000),
                note: report.note?.slice(0, 2000),
                code: report.code?.slice(0, 100),
                model: report.model?.slice(0, 200),
                actions: recentActions(),
                page: location.pathname.slice(0, 500),
                version: process.env.APP_VERSION,
                sessionId: chatSessionId(),
            }),
        })
        const data = await res.json()
        return data?.logged === true
    } catch {
        return false
    }
}

/**
 * Records an error the user did not report: each message once per page
 * load, and at most MAX_AUTOMATIC of them. Nothing is sent when the server
 * does not keep reports. The message is cut short: the user does not see
 * what goes, and some errors quote what the model sent.
 */
export async function recordError(report: ErrorReport): Promise<void> {
    if (recorded.has(report.message) || recorded.size >= MAX_AUTOMATIC) return
    recorded.add(report.message)
    if (await reportsEnabled()) {
        await sendErrorReport({
            ...report,
            message: report.message.slice(0, MAX_AUTOMATIC_MESSAGE),
        })
    }
}

/**
 * Whether an error came from the app's own scripts: the first stack line
 * that names a file is one of them (Chrome writes "at f (url:1:2)",
 * Firefox and Safari "f@url:1:2"). Browser extensions throw on the page
 * too, from their own files.
 */
export function isAppError(error: unknown): error is Error {
    if (!(error instanceof Error) || error.name === "AbortError") return false
    const frame = error.stack?.split("\n").find((line) => FRAME.test(line))
    return !!frame && frame.includes("/_next/")
}

/** A new GitHub issue with the error filled in, for servers that do not
 * keep reports (the desktop app, most self-hosted ones) */
export function githubIssueUrl(report: ErrorReport): string {
    const build = (note: string, message: string) =>
        [
            "**What I was doing**",
            "",
            note,
            "",
            "**Error**",
            "",
            "```",
            message,
            shortStack(report.stack, 6) ?? "",
            "```",
            "",
            "**Recent actions**",
            "",
            recentActions().join("\n") || "(none)",
            "",
            `Version: ${process.env.APP_VERSION ?? "unknown"}${window.electronAPI?.isElectron ? " (desktop app)" : ""}`,
            `Page: ${location.pathname}`,
            `Browser: ${navigator.userAgent}`,
            ...(report.code ? [`Code: ${report.code}`] : []),
            ...(report.model ? [`Model: ${report.model}`] : []),
        ].join("\n")
    // GitHub refuses very long addresses, and Chinese text grows ninefold
    // when encoded: the note gets shorter first, then the message; the
    // version and browser always stay
    let note = report.note?.trim() ?? ""
    let message = report.message
    while (encodeURIComponent(build(note, message)).length > 6000) {
        if (note) note = shorten(note, 0.8)
        else if (message) message = shorten(message, 0.8)
        else break
    }
    const body = build(note, message)
    const title = `Error: ${Array.from(report.message.split("\n")[0]).slice(0, 80).join("")}`
    return `${ISSUES_URL}?${new URLSearchParams({ title, body })}`
}

/**
 * An error toast for a failure the user did not cause: recorded, with a
 * Report button that opens the report dialog. It stays longer than other
 * toasts, so there is time to press it.
 */
export function toastUnexpectedError(
    text: string,
    reportLabel: string,
    error?: unknown,
    options?: { id?: string; duration?: number },
) {
    const detail = error instanceof Error ? error.message : ""
    const report: ErrorReport = {
        kind: "toast",
        // A file read error's text is the toast's own
        message: detail && detail !== text ? `${text}\n${detail}` : text,
        stack: error instanceof Error ? error.stack : undefined,
    }
    void recordError(report)
    toast.error(text, {
        duration: 10000,
        ...options,
        action: {
            label: reportLabel,
            onClick: () => useUiStore.getState().openProblemReport(report),
        },
    })
}

// The stack's call lines only (Chrome's first line repeats the message,
// which goes cut short on its own), each at most 300 characters
function shortStack(stack: string | undefined, lines = 12) {
    return stack
        ?.split("\n")
        .filter((line) => FRAME.test(line))
        .slice(0, lines)
        .map((line) => line.slice(0, 300))
        .join("\n")
}

/** The text cut to a share of its characters, never inside one */
function shorten(text: string, share: number): string {
    const chars = Array.from(text)
    return chars.slice(0, Math.floor(chars.length * share)).join("")
}

// The chat's Langfuse session, so a report sits next to its chat traces
function chatSessionId(): string | undefined {
    try {
        return localStorage.getItem(STORAGE_KEYS.sessionId) || undefined
    } catch {
        return undefined
    }
}
