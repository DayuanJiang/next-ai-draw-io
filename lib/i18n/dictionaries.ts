import "server-only"

import type { Locale } from "./config"

const dictionaries = {
    en: () => import("./dictionaries/en.json").then((m) => m.default),
    zh: () => import("./dictionaries/zh.json").then((m) => m.default),
    ja: () => import("./dictionaries/ja.json").then((m) => m.default),
    "zh-Hant": () =>
        import("./dictionaries/zh-Hant.json").then((m) => m.default),
}

export type Dictionary = Awaited<ReturnType<(typeof dictionaries)["en"]>>

export const hasLocale = (locale: string): locale is Locale =>
    locale in dictionaries

export async function getDictionary(locale: Locale): Promise<Dictionary> {
    return dictionaries[locale]()
}
