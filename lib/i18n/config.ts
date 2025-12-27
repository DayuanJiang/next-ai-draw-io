export const i18n = {
    defaultLocale: "zh",
    locales: ["en", "zh", "ja"],
} as const

export type Locale = (typeof i18n)["locales"][number]
