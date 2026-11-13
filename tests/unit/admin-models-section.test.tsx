import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ModelsSection } from "@/app/[lang]/admin/models-section"
import { LocaleProvider } from "@/components/canvas/locale-context"
import { DictionaryProvider } from "@/hooks/use-dictionary"
import type { Dictionary } from "@/lib/i18n/dictionaries"
import en from "@/lib/i18n/dictionaries/en.json"

// What /api/admin/test-model answers
const answer = vi.hoisted(() => ({ data: {} as Record<string, unknown> }))
vi.mock("@/app/[lang]/admin/admin-shared", async (importOriginal) => ({
    ...(await importOriginal<
        typeof import("@/app/[lang]/admin/admin-shared")
    >()),
    adminFetch: async () => answer.data,
}))

afterEach(cleanup)

async function testModel(data: Record<string, unknown>) {
    answer.data = data
    render(
        <DictionaryProvider dictionary={en as unknown as Dictionary}>
            <LocaleProvider locale="en">
                <ModelsSection
                    providers={[
                        {
                            id: "p1",
                            provider: "glm",
                            models: ["some-model"],
                        },
                    ]}
                    envProviders={[]}
                    envHasDefaultModel={false}
                    disabled={false}
                    password="pw"
                    onChange={() => {}}
                />
            </LocaleProvider>
        </DictionaryProvider>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Test" }))
}

describe("the admin panel's model Test result", () => {
    it("shows the warning of a model that answered without a tool call", async () => {
        const warning =
            "Connected, but the model answered without calling a tool. It may not support tool calls, which drawing needs."
        await testModel({ valid: true, responseTime: 19, warning })
        await waitFor(() => screen.getByText("Passed (19 ms)"))
        expect(screen.getByText(warning)).toBeTruthy()
        // Not the green of a clean pass
        expect(screen.getByText("Passed (19 ms)").className).toContain("amber")
    })

    it("shows the whole reason of a failed test", async () => {
        const error =
            "AWS credentials (a Bedrock API key, or an Access Key ID and Secret Access Key, and a Region) are required"
        await testModel({ valid: false, error })
        const reason = await waitFor(() => screen.getByText(error))
        expect(reason.className).not.toContain("truncate")
        expect(screen.getByText("Failed")).toBeTruthy()
    })

    it("shows the dictionary's text for a failure that comes as a code alone", async () => {
        // A base URL without its /v1
        await testModel({ valid: false, code: "wrong_base_url" })
        await waitFor(() => screen.getByText(en.errors.llm.wrong_base_url))
    })

    it("keeps a clean pass on the model's line", async () => {
        await testModel({ valid: true, responseTime: 21 })
        const passed = await waitFor(() => screen.getByText("Passed (21 ms)"))
        expect(passed.className).toContain("green")
        expect(screen.queryByText(/without calling a tool/)).toBeNull()
    })
})
