// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
import {
    checkAndIncrementRequest,
    checkFollowUpRequest,
    recordTokenUsage,
} from "@/lib/dynamo-quota-manager"

const conditionFailed = () =>
    new ConditionalCheckFailedException({ message: "failed", $metadata: {} })

beforeEach(() => {
    send.mockReset()
})

describe("a turn's follow-up requests", () => {
    const LIMITS = { requests: 10, tokens: 200000, tpm: 20000 }
    // What a chat request that ends with the user's message does: it is
    // counted, and allows five follow-ups
    const userRequest = () => checkAndIncrementRequest("user", LIMITS, 1, 5)
    const followUps = async (count: number) => {
        const results = []
        for (let i = 0; i < count; i++) {
            results.push(await checkFollowUpRequest("user", LIMITS))
        }
        return results
    }

    // The user's item of the day. The commands run on it with as much of
    // DynamoDB's expression language as the quota uses, so the tests see
    // what the real expressions do.
    let item: Record<string, string | number>
    const runOnItem = async ({ input }: { input: any }) => {
        const value = (name: string) => {
            const { N, S } = input.ExpressionAttributeValues[name]
            return N === undefined ? S : Number(N)
        }
        // A comparison with an attribute the item does not have is false
        const compare = (
            name: string,
            operator: "<" | ">" | "<>",
            valueName: string,
        ) =>
            name in item &&
            {
                "<": item[name] < value(valueName),
                ">": item[name] > value(valueName),
                "<>": item[name] !== value(valueName),
            }[operator]
        const condition = input.ConditionExpression.replace(
            /(\w+) (<>|<|>) (:\w+)/g,
            'compare("$1", "$2", "$3")',
        )
            .replace(/attribute_not_exists\((\w+)\)/g, '!("$1" in item)')
            .replace(/attribute_exists\((\w+)\)/g, '("$1" in item)')
            .replace(/\bAND\b/g, "&&")
            .replace(/\bOR\b/g, "||")
        const holds = new Function("item", "compare", `return (${condition})`)
        if (!holds(item, compare)) {
            throw Object.assign(conditionFailed(), {
                Item: Object.fromEntries(
                    Object.entries(item).map(([name, v]) => [
                        name,
                        typeof v === "number" ? { N: String(v) } : { S: v },
                    ]),
                ),
            })
        }
        for (const [, name, valueName] of input.UpdateExpression.matchAll(
            /(\w+) = (:\w+)/g,
        )) {
            item[name] = value(valueName)
        }
        for (const [, name, valueName] of input.UpdateExpression.matchAll(
            /(\w+) (:\w+)/g,
        )) {
            item[name] = (Number(item[name]) || 0) + Number(value(valueName))
        }
        return {}
    }
    // The tokens of the turn's first step, recorded when it ended: more
    // than a minute allows
    const spendTheMinute = () =>
        Object.assign(item, {
            lastMinute: Math.floor(Date.now() / 60000).toString(),
            tpmCount: 25000,
            tokenCount: 25000,
        })

    beforeEach(() => {
        vi.useFakeTimers({ now: new Date("2026-11-13T10:00:30Z") })
        item = {}
        send.mockImplementation(runOnItem)
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it("lets a turn's follow-ups through without counting them, though its first step used up the minute's tokens", async () => {
        expect(await userRequest()).toEqual({ allowed: true })
        spendTheMinute()
        // 3 retries and 2 continuations, the most the browser sends
        expect(await followUps(5)).toEqual(Array(5).fill({ allowed: true }))
        expect(item.reqCount).toBe(1)
        // The next message of the user waits for the minute to pass
        expect(await userRequest()).toMatchObject({
            allowed: false,
            type: "tpm",
        })
    })

    it("counts a client's further follow-ups as requests, up to the daily limit", async () => {
        await userRequest()
        // Twenty requests that end with an assistant message: five ride on
        // the counted request, nine more use up the day's ten requests
        const allowed = (await followUps(20)).map((result) => result.allowed)
        expect(allowed).toEqual([
            ...Array(14).fill(true),
            ...Array(6).fill(false),
        ])
        expect(item.reqCount).toBe(10)
        expect(await checkFollowUpRequest("user", LIMITS)).toEqual({
            allowed: false,
            type: "request",
            error: "Daily request limit exceeded",
            used: 10,
            limit: 10,
        })
    })

    it("holds a client's further follow-ups to the per-minute limit", async () => {
        await userRequest()
        spendTheMinute()
        const results = await followUps(20)
        expect(results.map((result) => result.allowed)).toEqual([
            ...Array(5).fill(true),
            ...Array(15).fill(false),
        ])
        expect(results[5].type).toBe("tpm")
        expect(item.reqCount).toBe(1)
    })

    it("allows none before the day's first counted request", async () => {
        await followUps(3)
        expect(item.reqCount).toBe(3)
    })

    it("gives each user message its own five", async () => {
        await userRequest()
        await followUps(4)
        await userRequest()
        await followUps(5)
        expect(item.reqCount).toBe(2)
        await followUps(1)
        expect(item.reqCount).toBe(3)
    })

    it("refuses a follow-up once the day's tokens are used up", async () => {
        await userRequest()
        item.tokenCount = 200000
        expect(await checkFollowUpRequest("user", LIMITS)).toMatchObject({
            allowed: false,
            type: "token",
        })
        expect(item).toMatchObject({ reqCount: 1, followUpsLeft: 5 })
    })

    it("leaves a turn's follow-ups alone when its screenshot is checked", async () => {
        await userRequest()
        await followUps(2)
        // The screenshot check counts no request
        await checkAndIncrementRequest("user", { ...LIMITS, requests: 0 }, 0)
        expect(item).toEqual({ reqCount: 1, followUpsLeft: 3 })
    })

    it("sends only the values its expressions use, as DynamoDB demands", async () => {
        await userRequest()
        await followUps(6)
        expect(send).toHaveBeenCalledTimes(8)
        for (const [{ input }] of send.mock.calls) {
            for (const name of Object.keys(input.ExpressionAttributeValues)) {
                expect(
                    `${input.UpdateExpression} ${input.ConditionExpression}`,
                ).toMatch(new RegExp(`${name}\\b`))
            }
        }
    })
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
