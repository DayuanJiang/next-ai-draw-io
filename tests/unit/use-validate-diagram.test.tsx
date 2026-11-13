import { renderHook } from "@testing-library/react"
import type { PropsWithChildren } from "react"
import { afterEach, expect, it, vi } from "vitest"
import { DictionaryProvider } from "@/hooks/use-dictionary"
import { useValidateDiagram } from "@/hooks/use-validate-diagram"
import type { Dictionary } from "@/lib/i18n/dictionaries"
import en from "@/lib/i18n/dictionaries/en.json"
import zh from "@/lib/i18n/dictionaries/zh.json"

afterEach(() => vi.unstubAllGlobals())

const answer = (status: number, body: unknown) =>
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json(body, { status })),
    )

const validate = (dictionary: unknown = en) =>
    renderHook(() => useValidateDiagram(), {
        wrapper: ({ children }: PropsWithChildren) => (
            <DictionaryProvider dictionary={dictionary as Dictionary}>
                {children}
            </DictionaryProvider>
        ),
    }).result.current.validate("data:image/png;base64,AA")

it("gives the server's result", async () => {
    const result = { valid: true, issues: [], suggestions: [] }
    answer(200, result)
    expect(await validate()).toEqual(result)
})

// The diagram's card shows the result: a check the server could not run
// (no model for it, the model call failed, the quota) must not read as valid
it("rejects with the server's reason when the check did not run", async () => {
    answer(503, { error: "This server has no model for screenshot checks." })
    await expect(validate()).rejects.toThrow(/no model for screenshot checks/)
    answer(429, { error: "Daily token limit exceeded", type: "token" })
    await expect(validate()).rejects.toThrow("Daily token limit exceeded")
})

it("gives a reason that has a code in the page's language", async () => {
    answer(503, {
        code: "noCheckModel",
        error: "This server has no model for screenshot checks (VALIDATION_MODEL or AI_MODEL).",
    })
    await expect(validate(zh)).rejects.toThrow(zh.validation.noCheckModel)
    expect(zh.validation.noCheckModel).not.toBe(en.validation.noCheckModel)
})
