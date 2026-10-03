export type DrawioMessage = Record<string, unknown>

export type DrawioLoadAction = DrawioMessage & {
    action: "load"
}

/** Parse a draw.io JSON protocol message without accepting arbitrary values. */
export function parseDrawioMessage(data: unknown): DrawioMessage | null {
    let parsed: unknown = data

    if (typeof data === "string") {
        try {
            parsed = JSON.parse(data)
        } catch {
            return null
        }
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null
    }

    return parsed as DrawioMessage
}

/** The embed host only needs the documented load action after the init event. */
export function parseDrawioLoadAction(data: unknown): DrawioLoadAction | null {
    const message = parseDrawioMessage(data)
    return message?.action === "load" ? (message as DrawioLoadAction) : null
}

export function isDrawioEmbedMode(search: string): boolean {
    return new URLSearchParams(search).get("embed") === "1"
}

export function getParentTargetOrigin(origin: string | null): string {
    return origin && origin !== "null" ? origin : "*"
}
