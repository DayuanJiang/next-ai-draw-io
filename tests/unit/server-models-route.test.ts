// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "@/app/api/server-models/route"
import { _resetForTests } from "@/lib/admin/settings"

beforeEach(() => {
    // No admin panel providers from a local data/settings.json
    vi.stubEnv("SETTINGS_FILE", "/nonexistent/settings.json")
    _resetForTests()
})

afterEach(() => {
    _resetForTests()
})

describe("GET /api/server-models", () => {
    it("does not name the server's key and URL variables", async () => {
        vi.stubEnv(
            "AI_MODELS_CONFIG",
            JSON.stringify({
                providers: [
                    {
                        name: "Team A",
                        provider: "openai",
                        models: ["gpt-5"],
                        apiKeyEnv: [
                            "OPENAI_KEY_TEAM_A_1",
                            "OPENAI_KEY_TEAM_A_2",
                        ],
                        baseUrlEnv: "INTERNAL_RELAY_URL",
                        default: true,
                    },
                ],
            }),
        )

        const res = await GET()
        const text = await res.text()
        // All the model picker reads
        expect(JSON.parse(text)).toEqual({
            models: [
                {
                    id: "server:team-a:gpt-5",
                    modelId: "gpt-5",
                    provider: "openai",
                    providerLabel: "Team A",
                    isDefault: true,
                },
            ],
        })
        expect(text).not.toContain("OPENAI_KEY_TEAM_A")
        expect(text).not.toContain("INTERNAL_RELAY_URL")
    })
})
