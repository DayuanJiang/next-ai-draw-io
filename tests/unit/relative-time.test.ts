import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { formatRelativeTime } from "@/lib/relative-time"

describe("formatRelativeTime", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date(2026, 10, 12, 12))
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    const at = (year: number, month: number, day: number) =>
        new Date(year, month - 1, day, 12).getTime()

    it("names recent times relative to now", () => {
        expect(formatRelativeTime(Date.now() - 20_000, "en", "Just now")).toBe(
            "Just now",
        )
        expect(formatRelativeTime(at(2026, 11, 11), "en", "Just now")).toBe(
            "yesterday",
        )
    })

    it("shows a date of this year without the year", () => {
        expect(formatRelativeTime(at(2026, 3, 5), "en", "Just now")).toBe(
            "Mar 5",
        )
    })

    it("adds the year to a date of another year", () => {
        expect(formatRelativeTime(at(2025, 11, 13), "en", "Just now")).toBe(
            "Nov 13, 2025",
        )
        expect(formatRelativeTime(at(2025, 11, 13), "zh", "刚刚")).toBe(
            "2025年11月13日",
        )
        expect(formatRelativeTime(at(2024, 11, 8), "ja", "たった今")).toBe(
            "2024年11月8日",
        )
    })
})
