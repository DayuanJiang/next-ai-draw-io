import { describe, expect, it } from "vitest"
import {
    generateDefaultTitle,
    searchTemplates,
    sortTemplates,
    type Template,
    validateImportData,
} from "@/lib/template-storage"

describe("generateDefaultTitle", () => {
    it("returns the prompt as-is when 20 chars or fewer", () => {
        expect(generateDefaultTitle("Hello")).toBe("Hello")
        expect(generateDefaultTitle("A".repeat(20))).toBe("A".repeat(20))
    })

    it("truncates to 20 chars with ellipsis for longer prompts", () => {
        const result = generateDefaultTitle(
            "This is a very long prompt that should be truncated",
        )
        expect(result).toBe("This is a very long...")
        expect(result.length).toBeGreaterThan(20)
    })

    it("trims whitespace before truncating", () => {
        expect(generateDefaultTitle("   hello   ")).toBe("hello")
        expect(generateDefaultTitle("   " + "x".repeat(25) + "   ")).toBe(
            "xxxxxxxxxxxxxxxxxxxx...",
        )
    })
})

describe("sortTemplates", () => {
    const baseTemplate = (
        overrides: Partial<Omit<Template, "id">> & Pick<Template, "id">,
    ): Template => ({
        title: "Test",
        prompt: "test prompt",
        createdAt: 1000,
        updatedAt: 1000,
        clickCount: 0,
        runCount: 0,
        lastUsedAt: 0,
        pinned: false,
        ...overrides,
    })

    it("sorts pinned templates first", () => {
        const templates = [
            baseTemplate({ id: "1", runCount: 10 }),
            baseTemplate({ id: "2", pinned: true, runCount: 1 }),
        ]
        const result = sortTemplates(templates)
        expect(result[0].id).toBe("2")
    })

    it("sorts by runCount descending among non-pinned", () => {
        const templates = [
            baseTemplate({ id: "1", runCount: 5 }),
            baseTemplate({ id: "2", runCount: 10 }),
            baseTemplate({ id: "3", runCount: 1 }),
        ]
        const result = sortTemplates(templates)
        expect(result.map((t) => t.id)).toEqual(["2", "1", "3"])
    })

    it("sorts by lastUsedAt descending when runCount is equal", () => {
        const templates = [
            baseTemplate({ id: "1", runCount: 5, lastUsedAt: 100 }),
            baseTemplate({ id: "2", runCount: 5, lastUsedAt: 200 }),
        ]
        const result = sortTemplates(templates)
        expect(result[0].id).toBe("2")
    })

    it("sorts by updatedAt descending when runCount and lastUsedAt are equal", () => {
        const templates = [
            baseTemplate({
                id: "1",
                runCount: 5,
                lastUsedAt: 100,
                updatedAt: 50,
            }),
            baseTemplate({
                id: "2",
                runCount: 5,
                lastUsedAt: 100,
                updatedAt: 150,
            }),
        ]
        const result = sortTemplates(templates)
        expect(result[0].id).toBe("2")
    })

    it("does not mutate the original array", () => {
        const templates = [
            baseTemplate({ id: "1", runCount: 1 }),
            baseTemplate({ id: "2", runCount: 10 }),
        ]
        const copy = [...templates]
        sortTemplates(templates)
        expect(templates.map((t) => t.id)).toEqual(copy.map((t) => t.id))
    })

    it("returns empty array for empty input", () => {
        expect(sortTemplates([])).toEqual([])
    })
})

describe("searchTemplates", () => {
    const templates: Template[] = [
        {
            id: "1",
            title: "Flowchart",
            prompt: "Create a flowchart",
            description: "Basic flowchart template",
            createdAt: 1000,
            updatedAt: 1000,
            clickCount: 0,
            runCount: 0,
            lastUsedAt: 0,
            pinned: false,
        },
        {
            id: "2",
            title: "ER Diagram",
            prompt: "Design a database",
            description: "Entity relationship diagram",
            createdAt: 1000,
            updatedAt: 1000,
            clickCount: 0,
            runCount: 0,
            lastUsedAt: 0,
            pinned: false,
        },
        {
            id: "3",
            title: "Network",
            prompt: "Draw network topology",
            createdAt: 1000,
            updatedAt: 1000,
            clickCount: 0,
            runCount: 0,
            lastUsedAt: 0,
            pinned: false,
        },
    ]

    it("returns all templates when query is empty", () => {
        expect(searchTemplates(templates, "")).toHaveLength(3)
        expect(searchTemplates(templates, "   ")).toHaveLength(3)
    })

    it("searches by title", () => {
        const result = searchTemplates(templates, "flowchart")
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe("1")
    })

    it("searches by description", () => {
        const result = searchTemplates(templates, "entity")
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe("2")
    })

    it("is case-insensitive", () => {
        const result = searchTemplates(templates, "FLOWCHART")
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe("1")
    })

    it("returns empty array when no match", () => {
        const result = searchTemplates(templates, "nonexistent")
        expect(result).toHaveLength(0)
    })

    it("handles templates without description", () => {
        const result = searchTemplates(templates, "network")
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe("3")
    })
})

describe("validateImportData", () => {
    it("rejects non-object input", () => {
        expect(validateImportData(null).valid).toBe(false)
        expect(validateImportData("string").valid).toBe(false)
        expect(validateImportData(123).valid).toBe(false)
    })

    it("rejects missing schemaVersion", () => {
        const result = validateImportData({ templates: [] })
        expect(result.valid).toBe(false)
        expect(result.error).toContain("schemaVersion")
    })

    it("rejects missing templates array", () => {
        const result = validateImportData({ schemaVersion: 1 })
        expect(result.valid).toBe(false)
        expect(result.error).toContain("templates")
    })

    it("rejects template with missing prompt", () => {
        const result = validateImportData({
            schemaVersion: 1,
            templates: [{ title: "Test" }],
        })
        expect(result.valid).toBe(false)
        expect(result.error).toContain("prompt")
    })

    it("rejects template with empty prompt", () => {
        const result = validateImportData({
            schemaVersion: 1,
            templates: [{ title: "Test", prompt: "   " }],
        })
        expect(result.valid).toBe(false)
        expect(result.error).toContain("prompt")
    })

    it("rejects template with missing title", () => {
        const result = validateImportData({
            schemaVersion: 1,
            templates: [{ prompt: "test" }],
        })
        expect(result.valid).toBe(false)
        expect(result.error).toContain("title")
    })

    it("accepts valid data", () => {
        const result = validateImportData({
            schemaVersion: 1,
            templates: [
                {
                    id: "1",
                    title: "Test",
                    prompt: "test prompt",
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    clickCount: 0,
                    runCount: 0,
                    lastUsedAt: 0,
                    pinned: false,
                },
            ],
        })
        expect(result.valid).toBe(true)
    })

    it("accepts empty templates array", () => {
        const result = validateImportData({
            schemaVersion: 1,
            templates: [],
        })
        expect(result.valid).toBe(true)
    })

    it("reports index of invalid template", () => {
        const result = validateImportData({
            schemaVersion: 1,
            templates: [
                { title: "Valid", prompt: "valid" },
                { title: "Also Valid", prompt: "also valid" },
                { title: "No Prompt" },
            ],
        })
        expect(result.valid).toBe(false)
        expect(result.error).toContain("index 2")
    })
})
