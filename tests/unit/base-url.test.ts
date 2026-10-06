import { describe, expect, it } from "vitest"
import {
    chatRequestUrl,
    normalizeBaseUrl,
    ollamaApiUrl,
} from "@/lib/types/model-config"

describe("normalizeBaseUrl", () => {
    it("drops spaces, trailing slashes and a pasted endpoint path", () => {
        expect(normalizeBaseUrl(" https://api.x.com/v1/ ")).toBe(
            "https://api.x.com/v1",
        )
        expect(normalizeBaseUrl("https://api.x.com/v1/chat/completions")).toBe(
            "https://api.x.com/v1",
        )
        expect(
            normalizeBaseUrl("https://api.x.com/anthropic/v1/messages/"),
        ).toBe("https://api.x.com/anthropic/v1")
    })

    it("keeps provider paths such as /api/paas/v4 and /api/v3", () => {
        expect(normalizeBaseUrl("https://open.bigmodel.cn/api/paas/v4")).toBe(
            "https://open.bigmodel.cn/api/paas/v4",
        )
        expect(
            normalizeBaseUrl("https://ark.cn-beijing.volces.com/api/v3"),
        ).toBe("https://ark.cn-beijing.volces.com/api/v3")
    })
})

describe("chatRequestUrl", () => {
    it("shows the endpoint the SDK will call", () => {
        expect(chatRequestUrl("glm", "https://api.x.com/v1/")).toBe(
            "https://api.x.com/v1/chat/completions",
        )
        expect(
            chatRequestUrl("anthropic", "https://proxy.example.com/v1"),
        ).toBe("https://proxy.example.com/v1/messages")
        expect(chatRequestUrl("ollama", "http://localhost:11434")).toBe(
            "http://localhost:11434/api/chat",
        )
    })

    it("stays out of the way for SDKs that build their own paths", () => {
        expect(chatRequestUrl("google", "https://x.example.com")).toBeNull()
        expect(chatRequestUrl("minimax", "https://x.example.com")).toBeNull()
        expect(chatRequestUrl("glm", "  ")).toBeNull()
    })
})

describe("ollamaApiUrl", () => {
    it("points at Ollama's /api whatever form the address takes", () => {
        for (const url of [
            "http://localhost:11434",
            "http://localhost:11434/",
            "http://localhost:11434/api",
            "http://localhost:11434/api/",
            "http://localhost:11434/v1",
            "http://localhost:11434/v1/chat/completions",
        ]) {
            expect(ollamaApiUrl(url)).toBe("http://localhost:11434/api")
        }
        expect(ollamaApiUrl("https://ollama.com/api")).toBe(
            "https://ollama.com/api",
        )
    })
})
