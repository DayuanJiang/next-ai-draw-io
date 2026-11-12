import { renderHook } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { useValidateDiagram } from "@/hooks/use-validate-diagram"

afterEach(() => vi.unstubAllGlobals())

const answer = (status: number, body: unknown) =>
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json(body, { status })),
    )

const validate = () =>
    renderHook(() => useValidateDiagram()).result.current.validate(
        "data:image/png;base64,AA",
    )

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
