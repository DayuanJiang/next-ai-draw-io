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

import { POST as testModel } from "@/app/api/admin/test-model/route"
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

    it("takes a Bedrock API key instead of access keys", async () => {
        factory.overrides = null
        await validateModel(
            new Request("http://localhost/api/validate-model", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider: "bedrock",
                    modelId: "amazon.nova-lite-v1:0",
                    apiKey: "bedrock-api-key",
                    awsRegion: "us-east-1",
                }),
            }),
        )
        expect(factory.overrides.apiKey).toBe("bedrock-api-key")
    })

    it("still needs a region with an API key", async () => {
        factory.overrides = null
        const response = await validateModel(
            new Request("http://localhost/api/validate-model", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider: "bedrock",
                    modelId: "amazon.nova-lite-v1:0",
                    apiKey: "bedrock-api-key",
                }),
            }),
        )
        expect(response.status).toBe(400)
        expect(factory.overrides).toBeNull()
    })

    it("runs an admin panel entry without keys, on the server's IAM role", async () => {
        // Chat on such an entry uses the default AWS credential chain; the
        // Test used to stop at "AWS credentials are required"
        factory.overrides = null
        vi.stubEnv("ADMIN_PASSWORD", "admin-pw")
        vi.stubEnv("SETTINGS_FILE", "/nonexistent/settings.json")
        await testModel(
            new Request("http://localhost/api/admin/test-model", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-admin-password": "admin-pw",
                },
                body: JSON.stringify({
                    provider: {
                        id: "p1",
                        provider: "bedrock",
                        awsRegion: "us-east-2",
                        models: ["amazon.nova-lite-v1:0"],
                    },
                    modelId: "amazon.nova-lite-v1:0",
                }),
            }),
        )
        expect(factory.overrides).toMatchObject({
            provider: "bedrock",
            awsRegion: "us-east-2",
        })
        expect(factory.overrides.awsAccessKeyId).toBeUndefined()
    })
})
