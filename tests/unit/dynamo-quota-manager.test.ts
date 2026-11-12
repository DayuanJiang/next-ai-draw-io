// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

// The quota is on when the table is named at import; every command goes to
// this send
const send = vi.hoisted(() => {
    vi.stubEnv("DYNAMODB_QUOTA_TABLE", "quota-test")
    return vi.fn()
})
vi.mock("@aws-sdk/client-dynamodb", () => ({
    ConditionalCheckFailedException: class extends Error {},
    UpdateItemCommand: class {
        constructor(readonly input: unknown) {}
    },
    DynamoDBClient: class {
        send = send
    },
}))

import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb"
import { recordTokenUsage } from "@/lib/dynamo-quota-manager"

const conditionFailed = () =>
    new ConditionalCheckFailedException({ message: "failed", $metadata: {} })

beforeEach(() => {
    send.mockReset()
})

describe("recordTokenUsage", () => {
    it("starts a new minute's count from the earlier minute only", async () => {
        send.mockRejectedValueOnce(conditionFailed()).mockResolvedValue({})
        await recordTokenUsage("user", 12000)
        const sent = send.mock.calls.map(([command]) => command.input)
        expect(sent).toHaveLength(2)
        expect(sent[1].UpdateExpression).toContain("tpmCount = :tokens")
        expect(sent[1].ConditionExpression).toBe("lastMinute <> :minute")
    })

    it("adds to a minute another answer started meanwhile", async () => {
        // Two answers of one user end together as a minute's first: the
        // other one's reset comes first, so this one's reset is refused
        send.mockRejectedValueOnce(conditionFailed())
            .mockRejectedValueOnce(conditionFailed())
            .mockResolvedValue({})
        await recordTokenUsage("user", 11000)
        const sent = send.mock.calls.map(([command]) => command.input)
        expect(sent).toHaveLength(3)
        expect(sent[2].UpdateExpression).toContain(
            "ADD tokenCount :tokens, tpmCount :tokens",
        )
    })
})
