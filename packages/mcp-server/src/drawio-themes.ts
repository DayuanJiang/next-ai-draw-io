const DRAWIO_THEMES = [
    "kennedy",
    "atlas",
    "dark",
    "min",
    "sketch",
    "simple",
] as const

type DrawioTheme = (typeof DRAWIO_THEMES)[number]

export function isDrawioTheme(value: string): value is DrawioTheme {
    return (DRAWIO_THEMES as readonly string[]).includes(value)
}

/** draw.io's name for a locale: lowercase, "zh-tw" for Traditional and "zh" for Simplified Chinese */
export function toDrawioLang(locale: string): string {
    const lang = locale.toLowerCase()
    if (lang === "zh-hant") return "zh-tw"
    return lang === "zh-hans" ? "zh" : lang
}
