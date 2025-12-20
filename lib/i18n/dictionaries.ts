import type { Locale } from "./config"
import en from "./dictionaries/en.json"
import ja from "./dictionaries/ja.json"
import zh from "./dictionaries/zh.json"

const DICTS = {
    en,
    zh,
    ja,
} as const

export type Dictionary = (typeof DICTS)[keyof typeof DICTS]

export async function getDictionary(locale: Locale): Promise<Dictionary> {
    // Return the requested dictionary or fallback to English
    return (DICTS[locale] ?? DICTS.en) as Dictionary
}

export default DICTS
