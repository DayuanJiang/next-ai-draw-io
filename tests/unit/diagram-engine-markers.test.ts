import { describe, expect, it } from "vitest"
import {
    hasMarkers,
    isPinned,
    readDir,
    readIntMarker,
    readKind,
    readMarker,
    stampContainer,
    stampLeaf,
    stripMarkers,
} from "@/lib/diagram-engine/markers"

// Real catalog styles from drawio-ai-kit's catalog/aws.json, verbatim. group_vpc
// ships WITHOUT container=1; group_account ships WITH it. The engine has to handle both.
const VPC_STYLE =
    "sketch=0;outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=12;fontStyle=0;shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_vpc;strokeColor=#879196;fillColor=none;verticalAlign=top;align=left;spacingLeft=30;fontColor=#879196;dashed=0;"
const ACCOUNT_STYLE =
    "points=[[0,0],[0.25,0],[0.5,0]];outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=12;fontStyle=0;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_account;strokeColor=#CD2264;fillColor=none;verticalAlign=top;align=left;spacingLeft=30;fontColor=#CD2264;dashed=0;"

describe("stampContainer", () => {
    it("adds container tokens to a catalog style that lacks them", () => {
        const s = stampContainer(VPC_STYLE, {
            kind: "group",
            dir: "col",
            gap: 22,
        })
        expect(s).toContain("container=1;")
        expect(s).toContain("pointerEvents=0;")
        expect(s).toContain("collapsible=0;")
        expect(s).toContain("recursiveResize=0;")
    })

    it("is safe on a style that already declares container=1", () => {
        const s = stampContainer(ACCOUNT_STYLE, {
            kind: "group",
            dir: "row",
            gap: 30,
        })
        // Duplicate keys are legal in draw.io and the LAST wins (verified in-browser),
        // so appending a second container=1 keeps the shape a container.
        expect(s.match(/container=1/g)?.length).toBe(2)
        expect(readDir(s)).toBe("row")
    })

    it("records kind, dir and gap so the parser need not guess", () => {
        const s = stampContainer(VPC_STYLE, {
            kind: "group",
            dir: "col",
            gap: 22,
        })
        expect(readKind(s)).toBe("group")
        expect(readDir(s)).toBe("col")
        expect(readIntMarker(s, "dai_gap")).toBe(22)
    })

    it("records cols only for a grid", () => {
        const grid = stampContainer(VPC_STYLE, {
            kind: "grid",
            dir: "grid",
            gap: 14,
            cols: 3,
        })
        expect(readIntMarker(grid, "dai_cols")).toBe(3)

        const group = stampContainer(VPC_STYLE, {
            kind: "group",
            dir: "row",
            gap: 14,
            cols: 3,
        })
        expect(readIntMarker(group, "dai_cols")).toBeNull()
    })

    it("rounds a fractional gap", () => {
        const s = stampContainer(VPC_STYLE, {
            kind: "group",
            dir: "col",
            gap: 21.6,
        })
        expect(readIntMarker(s, "dai_gap")).toBe(22)
    })

    it("adds the missing separator when a style does not end in ;", () => {
        const s = stampContainer("rounded=0;fillColor=#FFF", {
            kind: "group",
            dir: "row",
            gap: 10,
        })
        expect(s).not.toContain("#FFFcontainer")
        expect(s).toContain("#FFF;container=1;")
    })
})

describe("readMarker duplicate handling", () => {
    it("returns the LAST value, mirroring how draw.io resolves duplicate keys", () => {
        // Verified in-browser: container=0;...;container=1; behaves as a container.
        expect(readMarker("a=1;dai_dir=row;b=2;dai_dir=col;", "dai_dir")).toBe(
            "col",
        )
    })

    it("does not match a key that is only a suffix of another key", () => {
        expect(readMarker("xdai_dir=row;", "dai_dir")).toBeNull()
    })

    it("returns null for an absent key", () => {
        expect(readMarker(VPC_STYLE, "dai_dir")).toBeNull()
    })

    it("reads a marker at the very start of the style", () => {
        expect(readMarker("dai_kind=box;rounded=0;", "dai_kind")).toBe("box")
    })
})

describe("readKind / readDir reject unknown values", () => {
    it("rejects a kind that is not in the union", () => {
        expect(readKind("dai_kind=wormhole;")).toBeNull()
    })

    it("rejects a direction that is not in the union", () => {
        expect(readDir("dai_dir=diagonal;")).toBeNull()
    })
})

describe("readIntMarker", () => {
    it("rejects a non-numeric value rather than returning NaN", () => {
        expect(readIntMarker("dai_gap=wide;", "dai_gap")).toBeNull()
    })

    it("rejects a negative value", () => {
        expect(readIntMarker("dai_gap=-5;", "dai_gap")).toBeNull()
    })

    it("accepts zero", () => {
        expect(readIntMarker("dai_gap=0;", "dai_gap")).toBe(0)
    })
})

describe("isPinned", () => {
    it("is false when the marker is absent", () => {
        expect(isPinned(VPC_STYLE)).toBe(false)
    })

    it("is true for the value the engine writes", () => {
        expect(isPinned("dai_pin=1;")).toBe(true)
    })

    it("accepts what a user might hand-type in draw.io's Edit Style dialog", () => {
        expect(isPinned("dai_pin=yes;")).toBe(true)
        expect(isPinned("dai_pin=true;")).toBe(true)
    })

    it("treats 0 / false / empty as not pinned, so a user can unpin by editing", () => {
        expect(isPinned("dai_pin=0;")).toBe(false)
        expect(isPinned("dai_pin=false;")).toBe(false)
        expect(isPinned("dai_pin=;")).toBe(false)
    })
})

describe("stampLeaf", () => {
    it("marks an icon", () => {
        expect(readKind(stampLeaf("shape=mxgraph.aws4.ec2;", "icon"))).toBe(
            "icon",
        )
    })

    it("marks a box", () => {
        expect(readKind(stampLeaf("rounded=0;", "box"))).toBe("box")
    })
})

describe("stripMarkers", () => {
    it("removes every dai_ token and keeps the rest intact", () => {
        const stamped = stampContainer(VPC_STYLE, {
            kind: "group",
            dir: "col",
            gap: 22,
        })
        const stripped = stripMarkers(stamped)
        expect(stripped).not.toContain("dai_")
        // the real style tokens survive
        expect(stripped).toContain("grIcon=mxgraph.aws4.group_vpc")
        expect(stripped).toContain("container=1")
    })

    it("leaves a marker-free style semantically unchanged", () => {
        expect(stripMarkers(VPC_STYLE)).toBe(VPC_STYLE)
    })
})

describe("hasMarkers", () => {
    it("is false for a plain catalog style", () => {
        expect(hasMarkers(VPC_STYLE)).toBe(false)
    })

    it("is true for engine output", () => {
        expect(
            hasMarkers(
                stampContainer(VPC_STYLE, {
                    kind: "group",
                    dir: "row",
                    gap: 8,
                }),
            ),
        ).toBe(true)
    })

    it("is not fooled by a key that merely contains dai_", () => {
        expect(hasMarkers("mydai_dir=row;")).toBe(false)
    })
})
