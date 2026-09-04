import { createDeepSeek } from "@ai-sdk/deepseek"
import { generateText } from "ai"
import { describe, expect, it } from "vitest"

describe("DeepSeek V4 Vision image input", () => {
    it("includes image content in the chat completion request", async () => {
        let requestBody:
            | {
                  messages: Array<{
                      role: string
                      content: string | Array<Record<string, unknown>>
                  }>
              }
            | undefined

        const provider = createDeepSeek({
            apiKey: "test-key",
            baseURL: "https://example.test",
            fetch: async (_input, init) => {
                const body = init?.body
                const rawBody =
                    typeof body === "string"
                        ? body
                        : new TextDecoder().decode(body as Uint8Array)
                requestBody = JSON.parse(rawBody)

                return new Response(
                    JSON.stringify({
                        id: "test-response",
                        object: "chat.completion",
                        created: 1,
                        model: "deepseek-v4-flash-vision-exp",
                        choices: [
                            {
                                index: 0,
                                message: { role: "assistant", content: "ok" },
                                finish_reason: "stop",
                            },
                        ],
                        usage: {
                            prompt_tokens: 1,
                            completion_tokens: 1,
                            total_tokens: 2,
                        },
                    }),
                    {
                        status: 200,
                        headers: { "content-type": "application/json" },
                    },
                )
            },
        })

        await generateText({
            model: provider("deepseek-v4-flash-vision-exp"),
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Describe this image." },
                        {
                            type: "image",
                            image: "data:image/png;base64,aGVsbG8=",
                            mediaType: "image/png",
                        },
                    ],
                },
            ],
        })

        if (requestBody === undefined) {
            throw new Error("DeepSeek request was not captured")
        }

        const userMessage = requestBody.messages.find(
            (message) => message.role === "user",
        )
        expect(userMessage?.content).toEqual(
            expect.arrayContaining([
                { type: "text", text: "Describe this image." },
                {
                    type: "image_url",
                    image_url: {
                        url: "data:image/png;base64,aGVsbG8=",
                    },
                },
            ]),
        )
    })
})
