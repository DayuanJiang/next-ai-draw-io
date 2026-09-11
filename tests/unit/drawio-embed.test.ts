import { describe, expect, it } from "vitest"
import {
    getParentTargetOrigin,
    isDrawioEmbedMode,
    parseDrawioLoadAction,
    parseDrawioMessage,
} from "@/lib/drawio-embed"

describe("draw.io embed protocol", () => {
    it("enables embed mode only for embed=1", () => {
        expect(isDrawioEmbedMode("?embed=1")).toBe(true)
        expect(isDrawioEmbedMode("?foo=bar&embed=1")).toBe(true)
        expect(isDrawioEmbedMode("?embed=0")).toBe(false)
        expect(isDrawioEmbedMode("")).toBe(false)
    })

    it("parses object and JSON messages", () => {
        expect(
            parseDrawioMessage({ event: "save", xml: "<mxfile />" }),
        ).toEqual({
            event: "save",
            xml: "<mxfile />",
        })
        expect(
            parseDrawioMessage('{"action":"load","xml":"<mxfile />"}'),
        ).toEqual({
            action: "load",
            xml: "<mxfile />",
        })
    })

    it("rejects malformed and non-object messages", () => {
        expect(parseDrawioMessage("not json")).toBeNull()
        expect(parseDrawioMessage("null")).toBeNull()
        expect(parseDrawioMessage("[]")).toBeNull()
    })

    it("accepts only load actions from the parent host", () => {
        expect(
            parseDrawioLoadAction('{"action":"load","xml":"diagram"}'),
        ).toEqual({
            action: "load",
            xml: "diagram",
        })
        expect(
            parseDrawioLoadAction('{"action":"export","format":"svg"}'),
        ).toBeNull()
        expect(parseDrawioLoadAction('{"event":"save"}')).toBeNull()
    })

    it("uses a concrete parent origin when one is available", () => {
        expect(getParentTargetOrigin("https://bookstack.example.com")).toBe(
            "https://bookstack.example.com",
        )
        expect(getParentTargetOrigin("null")).toBe("*")
        expect(getParentTargetOrigin(null)).toBe("*")
    })
})
