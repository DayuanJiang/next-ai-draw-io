import { i18n, type Locale } from "@/lib/i18n/config"
import type { Dictionary } from "@/lib/i18n/dictionaries"
import en from "@/lib/i18n/dictionaries/en.json"
import ja from "@/lib/i18n/dictionaries/ja.json"
import zh from "@/lib/i18n/dictionaries/zh.json"
import zhHant from "@/lib/i18n/dictionaries/zh-Hant.json"

// The web app loads one dictionary on the server (lib/i18n/dictionaries.ts
// is server-only); the shell ships all four and picks in the browser
const DICTIONARIES: Record<Locale, Dictionary> = {
    en,
    zh,
    ja,
    "zh-Hant": zhHant,
}

/** Our locale for a language tag ("zh-TW", "ja-JP", "en-US"), or null */
export function matchLocale(tag: string): Locale | null {
    const lower = tag.trim().toLowerCase()
    if (!lower) return null
    if (/^zh-(hant|tw|hk|mo)\b/.test(lower)) return "zh-Hant"
    const base = lower.split("-")[0]
    if (base === "zh") return "zh"
    if (base === "ja") return "ja"
    if (base === "en") return "en"
    return null
}

/**
 * The shell's language: the server's DRAWIO_LANG when it is one of ours,
 * else the browser's first language we have, else English.
 */
export function pickLocale(
    configLang: string,
    browserLangs: readonly string[],
): Locale {
    for (const tag of [configLang, ...browserLangs]) {
        const locale = matchLocale(tag)
        if (locale) return locale
    }
    return i18n.defaultLocale
}

export function getShellDictionary(locale: Locale): Dictionary {
    return DICTIONARIES[locale]
}

// localStorage key of draw.io's own settings (its Editor.settingsKey); the
// bundled copy is on this origin
const DRAWIO_SETTINGS_KEY = ".drawio-config"

/**
 * Start draw.io in the shell's language when nothing else picks one. Without
 * DRAWIO_LANG (the lang parameter) draw.io takes the language stored in its
 * settings (Extras > Language) and is English when there is none, whatever
 * the browser's language: the shell would be Chinese around English menus.
 * The locale is written into those settings while they name no language, so
 * the menu stays and a language picked there is kept. Call it before the
 * editor's frame is made.
 */
export function shareLocaleWithDrawio(locale: Locale) {
    if (locale === "en") return
    try {
        const settings = JSON.parse(
            localStorage.getItem(DRAWIO_SETTINGS_KEY) ?? "{}",
        )
        if (settings.language) return
        // draw.io names Traditional Chinese "zh-tw"
        settings.language = locale === "zh-Hant" ? "zh-tw" : locale
        localStorage.setItem(DRAWIO_SETTINGS_KEY, JSON.stringify(settings))
    } catch {
        // Storage can be unavailable (private mode, quota): draw.io stays
        // English
    }
}
