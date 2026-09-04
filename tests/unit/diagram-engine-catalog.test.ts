import { describe, expect, it } from "vitest"
import {
    CATALOG_SIZE,
    checkNames,
    lookupStencil,
    resolveStyle,
    searchStencils,
} from "@/lib/diagram-engine/catalog"

describe("catalog contents", () => {
    it("carries the full AWS stencil set", () => {
        expect(CATALOG_SIZE.icons).toBe(983)
        expect(CATALOG_SIZE.groups).toBe(19)
    })
})

describe("lookupStencil", () => {
    it("returns the verbatim draw.io style, not a reconstruction", () => {
        const s3 = lookupStencil("s3")
        expect(s3?.style).toContain("shape=mxgraph.aws4.resourceIcon")
        expect(s3?.style).toContain("resIcon=mxgraph.aws4.s3")
        expect(s3?.style).toContain("aspect=fixed")
    })

    it("carries the official category colour", () => {
        // Storage is #7AA116, Compute #ED7100 — from AWS's own palette.
        expect(lookupStencil("s3")?.color).toBe("#7AA116")
        expect(lookupStencil("ec2")?.color).toBe("#ED7100")
    })

    it("finds an icon whose stencil has no resIcon token", () => {
        // 429 of the 983 AWS icons use a bare shape= instead of resourceIcon+resIcon.
        const a1 = lookupStencil("a1_instance")
        expect(a1).not.toBeNull()
        expect(a1?.style).toContain("shape=mxgraph.aws4.a1_instance")
        expect(a1?.style).not.toContain("resIcon=")
    })

    it("finds group stencils", () => {
        for (const g of [
            "group_vpc",
            "group_region",
            "group_subnet",
            "group_availability_zone",
            "group_account",
        ])
            expect(lookupStencil(g, "group")?.kind).toBe("group")
    })

    it("returns null for a name the model invented, rather than guessing", () => {
        expect(lookupStencil("s3_bucket_thing")).toBeNull()
        expect(lookupStencil("totally_made_up_service")).toBeNull()
    })

    it("respects the kind filter", () => {
        expect(lookupStencil("group_vpc", "icon")).toBeNull()
        expect(lookupStencil("s3", "group")).toBeNull()
    })
})

describe("resolveStyle", () => {
    it("hands the renderer a style for a known name", () => {
        expect(resolveStyle("ec2", "icon")).toContain("mxgraph.aws4")
    })

    it("returns null for an unknown name so the caller can decide", () => {
        expect(resolveStyle("nope", "icon")).toBeNull()
    })
})

describe("searchStencils", () => {
    it("ranks the plain service above its longer variants", () => {
        // Without a length penalty, "backup_aws_backup_support_for_amazon_s3"
        // scores the same as "s3" and can win by iteration order.
        expect(searchStencils("s3")[0].name).toBe("s3")
        expect(searchStencils("ec2")[0].name).toBe("ec2")
        expect(searchStencils("lambda")[0].name).toBe("lambda")
    })

    it("finds a multi-word service", () => {
        const hits = searchStencils("nat gateway").map((h) => h.name)
        expect(hits).toContain("nat_gateway")
    })

    it("maps shorthand onto tokens the catalog actually uses", () => {
        // AWS's stencil names are already abbreviated: EKS is "eks", and no name in the
        // catalog contains the word "kubernetes". So the alias has to resolve TO the
        // catalog's token, not to the spelled-out product name.
        expect(searchStencils("k8s")[0].name).toBe("eks")
        expect(searchStencils("kubernetes")[0].name).toBe("eks")
        expect(searchStencils("alb").map((h) => h.name)).toContain(
            "application_load_balancer",
        )
        expect(searchStencils("ddb")[0].name).toBe("dynamodb")
        expect(searchStencils("bucket")[0].name).toBe("s3")
    })

    it("returns colours so the model can see what it is getting", () => {
        expect(searchStencils("s3")[0].color).toBe("#7AA116")
    })

    it("does NOT return styles — they would be pure context burn", () => {
        const hit = searchStencils("s3")[0] as unknown as Record<
            string,
            unknown
        >
        expect(hit.style).toBeUndefined()
    })

    it("honours the limit", () => {
        expect(searchStencils("aws", { limit: 3 })).toHaveLength(3)
    })

    it("can search groups only", () => {
        const hits = searchStencils("vpc", { kind: "group" })
        expect(hits.length).toBeGreaterThan(0)
        expect(hits.every((h) => h.kind === "group")).toBe(true)
    })

    it("returns nothing for an empty query rather than the whole catalog", () => {
        expect(searchStencils("")).toEqual([])
        expect(searchStencils("   ")).toEqual([])
    })

    it("returns nothing for a query that matches no stencil", () => {
        expect(searchStencils("zzzznotathing")).toEqual([])
    })

    it("is case- and separator-insensitive", () => {
        const a = searchStencils("NAT_GATEWAY")[0].name
        const b = searchStencils("nat gateway")[0].name
        expect(a).toBe(b)
    })
})

describe("checkNames", () => {
    it("passes a tree whose names are all real", () => {
        expect(
            checkNames([
                { id: "a", name: "s3", kind: "icon" },
                { id: "b", name: "ec2", kind: "icon" },
                { id: "c", name: "group_vpc", kind: "group" },
            ]),
        ).toEqual([])
    })

    it("catches an invented name and suggests real ones", () => {
        const bad = checkNames([
            { id: "x", name: "s3_bucket_storage", kind: "icon" },
        ])
        expect(bad).toHaveLength(1)
        expect(bad[0].id).toBe("x")
        expect(bad[0].suggestions.length).toBeGreaterThan(0)
        expect(bad[0].suggestions).toContain("s3")
    })

    it("ignores a node with no name — a box, not an icon", () => {
        expect(checkNames([{ id: "b", name: "", kind: "icon" }])).toEqual([])
    })

    it("reports every bad name, not just the first", () => {
        const bad = checkNames([
            { id: "x", name: "fake_one", kind: "icon" },
            { id: "y", name: "s3", kind: "icon" },
            { id: "z", name: "fake_two", kind: "icon" },
        ])
        expect(bad.map((b) => b.id)).toEqual(["x", "z"])
    })

    it("catches a group name used where a group is expected", () => {
        const bad = checkNames([
            { id: "g", name: "group_nonexistent", kind: "group" },
        ])
        expect(bad).toHaveLength(1)
    })
})

describe("catalog styles are usable as-is", () => {
    it("every icon style names a shape draw.io can render", () => {
        // Spot-check a spread of names rather than all 983 — a systematic problem would
        // show up in any of them.
        for (const n of [
            "s3",
            "ec2",
            "lambda",
            "rds",
            "dynamodb",
            "a1_instance",
            "nat_gateway",
        ]) {
            const st = lookupStencil(n)?.style ?? ""
            expect(st).toMatch(/shape=mxgraph\.aws4\./)
        }
    })

    it("every group style carries grIcon and a container declaration", () => {
        for (const g of ["group_vpc", "group_region", "group_account"]) {
            const st = lookupStencil(g, "group")?.style ?? ""
            expect(st).toContain(`grIcon=mxgraph.aws4.${g}`)
        }
    })
})
