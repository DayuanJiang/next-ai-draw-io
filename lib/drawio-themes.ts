export const DRAWIO_THEMES = [
    "kennedy",
    "atlas",
    "dark",
    "min",
    "sketch",
    "simple",
] as const

export type DrawioTheme = (typeof DRAWIO_THEMES)[number]

export function isDrawioTheme(value: unknown): value is DrawioTheme {
    return (
        typeof value === "string" &&
        (DRAWIO_THEMES as readonly string[]).includes(value)
    )
}
