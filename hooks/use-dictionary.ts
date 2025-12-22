"use client"

import React, { createContext, useContext } from "react"
import type { Dictionary } from "@/lib/i18n/dictionaries"

const DictionaryContext = createContext<Dictionary | null>(null)

export function DictionaryProvider({
    children,
    dictionary,
}: React.PropsWithChildren<{ dictionary: Dictionary }>) {
    return React.createElement(
        DictionaryContext.Provider,
        { value: dictionary },
        children,
    )
}

export function useDictionary() {
    const dict = useContext(DictionaryContext)
    if (!dict) {
        throw new Error(
            "useDictionary must be used within a DictionaryProvider",
        )
    }
    return dict
}

export default useDictionary
