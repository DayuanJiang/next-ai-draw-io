import { countTokens } from "@anthropic-ai/tokenizer"
import { describe, expect, it } from "vitest"
import {
    describeDiagram,
    type Operation,
    restructureDiagram,
} from "@/lib/diagram-engine"
import { parseDiagram } from "@/lib/diagram-engine/parse"
import { findNode, findParent } from "@/lib/diagram-engine/types"

/** The operations that build a 3-tier VPC diagram from nothing. */
const BUILD_3TIER: Operation[] = [
    { op: "set_title", title: "VPC Multi-AZ 3-tier" },
    { op: "add_box", id: "users", label: "Users / Internet" },
    {
        op: "add_container",
        id: "region",
        label: "Region (ap-southeast-1)",
        dir: "row",
        gname: "group_region",
    },
    {
        op: "add_container",
        id: "vpc",
        parent: "region",
        label: "VPC 10.0.0.0/16",
        dir: "col",
        gname: "group_vpc",
    },
    {
        op: "add_icon",
        id: "igw",
        parent: "vpc",
        name: "internet_gateway",
        label: "Internet Gateway",
    },
    {
        op: "add_icon",
        id: "alb",
        parent: "vpc",
        name: "application_load_balancer",
        label: "ALB",
    },
    { op: "add_container", id: "azs", parent: "vpc", label: "", dir: "row" },
    {
        op: "add_container",
        id: "az_a",
        parent: "azs",
        label: "AZ-a",
        dir: "col",
        gname: "group_availability_zone",
    },
    {
        op: "add_container",
        id: "pub_a",
        parent: "az_a",
        label: "Public Subnet",
        dir: "col",
        gname: "group_subnet",
    },
    {
        op: "add_icon",
        id: "nat_a",
        parent: "pub_a",
        name: "nat_gateway",
        label: "NAT",
    },
    {
        op: "add_container",
        id: "app_a",
        parent: "az_a",
        label: "Private Subnet (App)",
        dir: "col",
        gname: "group_subnet",
    },
    { op: "add_icon", id: "ec2_a", parent: "app_a", name: "ec2", label: "EC2" },
    {
        op: "add_container",
        id: "db_a",
        parent: "az_a",
        label: "Private Subnet (Data)",
        dir: "col",
        gname: "group_subnet",
    },
    {
        op: "add_icon",
        id: "rds_a",
        parent: "db_a",
        name: "rds",
        label: "RDS (Primary)",
    },
    { op: "link", source: "users", target: "igw", label: "HTTPS", step: 1 },
    { op: "link", source: "igw", target: "alb", label: "forward", step: 2 },
    { op: "link", source: "alb", target: "ec2_a", label: "route", step: 3 },
    { op: "link", source: "ec2_a", target: "rds_a", label: "query", step: 4 },
]

describe("restructureDiagram builds from an empty canvas", () => {
    const r = restructureDiagram("", BUILD_3TIER)

    it("succeeds", () => {
        expect(r.errors).toEqual([])
        expect(r.xml).not.toBeNull()
    })

    it("produces XML draw.io can load", () => {
        expect(r.xml).toContain("<mxfile")
        expect(r.xml).toContain('<mxCell id="0"/>')
        expect(r.xml).toContain('<mxCell id="1" parent="0"/>')
    })

    it("resolves catalog names to verbatim stencil styles, with official colours", () => {
        // #ED7100 is AWS Compute orange; nothing here is hand-assembled.
        expect(r.xml).toContain("resIcon=mxgraph.aws4.ec2")
        expect(r.xml).toContain("#ED7100")
        expect(r.xml).toContain("grIcon=mxgraph.aws4.group_vpc")
    })

    it("stamps container=1 so a user can drag shapes between frames", () => {
        const vpcStyle =
            r.xml?.match(/<mxCell id="vpc"[^>]*style="([^"]*)"/)?.[1] ?? ""
        expect(vpcStyle).toContain("container=1")
    })

    it("reads back the structure it was asked to build", () => {
        const { tree } = parseDiagram(r.xml as string)
        expect(findParent(tree, "vpc")?.id).toBe("region")
        expect(findParent(tree, "az_a")?.id).toBe("azs")
        expect(findParent(tree, "nat_a")?.id).toBe("pub_a")
        expect(tree.links).toHaveLength(4)
        expect(tree.title).toBe("VPC Multi-AZ 3-tier")
    })
})

describe("restructureDiagram edits an existing canvas", () => {
    const built = restructureDiagram("", BUILD_3TIER).xml as string

    it("adds one node with one small operation", () => {
        const r = restructureDiagram(built, [
            {
                op: "add_icon",
                id: "cache_a",
                parent: "app_a",
                name: "elasticache",
                label: "Redis",
            },
        ])
        expect(r.errors).toEqual([])
        const { tree } = parseDiagram(r.xml as string)
        expect(findParent(tree, "cache_a")?.id).toBe("app_a")
        // everything else is still there
        expect(findNode(tree, "rds_a")).not.toBeNull()
        expect(tree.links).toHaveLength(4)
    })

    it("re-orients a container without touching anything else", () => {
        const r = restructureDiagram(built, [
            { op: "set_dir", id: "vpc", dir: "row" },
        ])
        expect(r.errors).toEqual([])
        const { tree } = parseDiagram(r.xml as string)
        expect((findNode(tree, "vpc") as { dir: string }).dir).toBe("row")
    })

    it("removes a subtree and the edges that pointed into it", () => {
        const r = restructureDiagram(built, [{ op: "remove", id: "db_a" }])
        const { tree } = parseDiagram(r.xml as string)
        expect(findNode(tree, "db_a")).toBeNull()
        expect(findNode(tree, "rds_a")).toBeNull()
        // the ec2 → rds edge went with it
        expect(tree.links).toHaveLength(3)
    })

    it("keeps a colour the user changed by hand", () => {
        const edited = built.replace(
            /(<mxCell id="users"[^>]*style="[^"]*)"/,
            '$1fillColor=#FF0000;"',
        )
        const r = restructureDiagram(edited, [
            { op: "set_label", id: "users", label: "Clients" },
        ])
        expect(r.xml).toContain("fillColor=#FF0000")
    })

    it("keeps a shape the user added by hand", () => {
        const edited = built.replace(
            "</root>",
            '<mxCell id="mynote" value="Note" style="shape=note;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="1200" y="60" width="140" height="80" as="geometry"/></mxCell></root>',
        )
        const r = restructureDiagram(edited, [
            {
                op: "add_icon",
                id: "s3",
                parent: "vpc",
                name: "s3",
                label: "S3",
            },
        ])
        expect(r.xml).toContain('id="mynote"')
    })

    it("respects where the user dragged a node to", () => {
        // The user moved the EC2 icon from the app subnet into the public subnet.
        const moved = built.replace(
            /(<mxCell id="ec2_a"[^>]*)parent="app_a"/,
            '$1parent="pub_a"',
        )
        const r = restructureDiagram(moved, [
            { op: "set_label", id: "ec2_a", label: "EC2 (moved)" },
        ])
        const { tree } = parseDiagram(r.xml as string)
        expect(findParent(tree, "ec2_a")?.id).toBe("pub_a")
    })
})

describe("invented stencil names are rejected, not rendered blank", () => {
    it("fails the whole call and suggests real names", () => {
        const r = restructureDiagram("", [
            {
                op: "add_icon",
                id: "x",
                name: "s3_bucket_storage",
                label: "Bucket",
            },
        ])
        expect(r.xml).toBeNull()
        expect(r.errors[0]).toContain("not in the stencil catalog")
        expect(r.errors[0]).toContain("s3")
    })

    it("rejects an invented group stencil too", () => {
        const r = restructureDiagram("", [
            {
                op: "add_container",
                id: "g",
                label: "X",
                dir: "row",
                gname: "group_made_up",
            },
        ])
        expect(r.xml).toBeNull()
        expect(r.errors[0]).toContain("not in the stencil catalog")
    })

    it("still returns the outline so the model can see what it built", () => {
        const r = restructureDiagram("", [
            { op: "add_icon", id: "x", name: "nope_not_real" },
        ])
        expect(r.outline).toContain("x: icon nope_not_real")
    })

    it("reports a failed operation without rendering a half-built diagram", () => {
        const r = restructureDiagram("", [
            { op: "add_icon", id: "a", name: "s3" },
            { op: "move", id: "ghost", parent: "a" },
        ])
        expect(r.xml).toBeNull()
        expect(r.errors.some((e) => e.includes("ghost"))).toBe(true)
    })
})

describe("describeDiagram", () => {
    it("reports an empty canvas plainly", () => {
        expect(describeDiagram("").outline).toBe("(empty canvas)")
    })

    it("outlines what is on the canvas without changing it", () => {
        const built = restructureDiagram("", BUILD_3TIER).xml as string
        const d = describeDiagram(built)
        expect(d.outline).toContain("vpc: col")
        expect(d.outline).toContain("ec2_a: icon ec2")
        expect(d.outline).toContain("link users -> igw")
        expect(d.needsAdoption).toBe(false)
    })

    it("flags a diagram that did not come from the engine", () => {
        const foreign = `<mxfile><diagram name="Page-1" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="X" style="rounded=0;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="100" height="50" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`
        expect(describeDiagram(foreign).needsAdoption).toBe(true)
    })
})

describe("token cost: operations versus raw XML", () => {
    // The reason for the whole exercise. Measured with Claude's own tokenizer, which the
    // repo already depends on, rather than a characters/4 estimate.
    const built = restructureDiagram("", BUILD_3TIER).xml as string

    it("building a diagram costs far fewer tokens as operations than as XML", () => {
        const asOps = countTokens(JSON.stringify(BUILD_3TIER))
        const asXml = countTokens(built)
        console.log(
            `build: ${asOps} tok as operations vs ${asXml} tok as XML (${(asXml / asOps).toFixed(1)}x)`,
        )
        expect(asOps).toBeLessThan(asXml / 2)
    })

    it("adding one icon costs a fraction of re-emitting the diagram", () => {
        const oneOp: Operation[] = [
            {
                op: "add_icon",
                id: "cache",
                parent: "app_a",
                name: "elasticache",
                label: "Redis",
            },
        ]
        const opTokens = countTokens(JSON.stringify(oneOp))
        const xmlTokens = countTokens(
            restructureDiagram(built, oneOp).xml as string,
        )
        console.log(
            `add one icon: ${opTokens} tok as an operation vs ${xmlTokens} tok re-emitting the XML (${Math.round(xmlTokens / opTokens)}x)`,
        )
        expect(opTokens).toBeLessThan(60)
        expect(opTokens).toBeLessThan(xmlTokens / 20)
    })

    it("the outline the model reads back is much cheaper than the XML", () => {
        const outlineTokens = countTokens(describeDiagram(built).outline)
        const xmlTokens = countTokens(built)
        console.log(
            `read current state: ${outlineTokens} tok as an outline vs ${xmlTokens} tok as XML (${(xmlTokens / outlineTokens).toFixed(1)}x)`,
        )
        expect(outlineTokens).toBeLessThan(xmlTokens / 3)
    })
})
