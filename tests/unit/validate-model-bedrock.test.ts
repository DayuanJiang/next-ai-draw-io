// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

// What the Test hands to the provider factory
const factory = vi.hoisted(() => ({ overrides: null as any }))
vi.mock("@/lib/ai-providers", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/ai-providers")>()),
    getAIModel: (overrides: unknown) => {
        factory.overrides = overrides
        throw new Error("stop here")
    },
}))

import { POST as validateModel } from "@/app/api/validate-model/route"

describe("testing Bedrock", () => {
    it("passes temporary credentials' session token on, as the chat does", async () => {
        await validateModel(
            new Request("http://localhost/api/validate-model", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider: "bedrock",
                    modelId: "amazon.nova-lite-v1:0",
                    awsAccessKeyId: "ASIA-temporary",
                    awsSecretAccessKey: "secret",
                    awsRegion: "us-east-1",
                    awsSessionToken: "session-token",
                }),
            }),
        )
        expect(factory.overrides.awsSessionToken).toBe("session-token")
    })
})
