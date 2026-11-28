// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { extractPdfText } from "@/lib/pdf-utils"

// A one page PDF that says "Order flow"; PDF.js finds the objects itself
// when the table at the end does not give their places
const PDF = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 44 >> stream
BT /F1 18 Tf 40 120 Td (Order flow) Tj ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
trailer << /Root 1 0 R /Size 6 >>
%%EOF`

// Safari before 18.4 and Chrome before 122 have no Iterator; unpdf's PDF.js
// reads Iterator.prototype as it loads, and no PDF could be attached there
// ("Serverless PDF.js bundle could not be resolved: ReferenceError:
// Iterator is not defined")
describe("a PDF in a browser without Iterator", () => {
    const Iterator = (globalThis as any).Iterator
    beforeAll(() => {
        delete (globalThis as any).Iterator
    })
    afterAll(() => {
        ;(globalThis as any).Iterator = Iterator
    })

    it("is read all the same", async () => {
        expect("Iterator" in globalThis).toBe(false)
        const file = new File([PDF], "order.pdf", { type: "application/pdf" })
        expect(await extractPdfText(file)).toContain("Order flow")
    })
})
