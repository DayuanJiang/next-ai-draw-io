"use client"

import {
    createContext,
    type ReactNode,
    useContext,
    useEffect,
    useState,
} from "react"

type Theme = "light" | "dark"

interface ThemeContextType {
    theme: Theme
    toggleTheme: () => void
    setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const THEME_STORAGE_KEY = "theme-preference"

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>("light")
    const [mounted, setMounted] = useState(false)

    // Load theme from localStorage and system preference
    useEffect(() => {
        setMounted(true)
        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme

        if (savedTheme) {
            setThemeState(savedTheme)
            applyTheme(savedTheme)
        } else {
            // Check system preference
            const prefersDark = window.matchMedia(
                "(prefers-color-scheme: dark)",
            ).matches
            const systemTheme = prefersDark ? "dark" : "light"
            setThemeState(systemTheme)
            applyTheme(systemTheme)
        }
    }, [])

    // Listen for system theme changes
    useEffect(() => {
        if (!mounted) return

        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
        const handleChange = (e: MediaQueryListEvent) => {
            // Only apply system preference if user hasn't set a preference
            const savedTheme = localStorage.getItem(THEME_STORAGE_KEY)
            if (!savedTheme) {
                const newTheme = e.matches ? "dark" : "light"
                setThemeState(newTheme)
                applyTheme(newTheme)
            }
        }

        mediaQuery.addEventListener("change", handleChange)
        return () => mediaQuery.removeEventListener("change", handleChange)
    }, [mounted])

    const applyTheme = (newTheme: Theme) => {
        const root = document.documentElement
        if (newTheme === "dark") {
            root.classList.add("dark")
        } else {
            root.classList.remove("dark")
        }
    }

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme)
        applyTheme(newTheme)
        localStorage.setItem(THEME_STORAGE_KEY, newTheme)
    }

    const toggleTheme = () => {
        const newTheme = theme === "light" ? "dark" : "light"
        setTheme(newTheme)
    }

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useTheme() {
    const context = useContext(ThemeContext)
    if (context === undefined) {
        throw new Error("useTheme must be used within a ThemeProvider")
    }
    return context
}
