import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { stampContainer } from "@/lib/diagram-engine/markers"
import {
    countPages,
    extractPage,
    parseDiagram,
} from "@/lib/diagram-engine/parse"
import {
    type ContainerNode,
    type DiagramNode,
    findNode,
    findParent,
    isContainer,
    walkTree,
} from "@/lib/diagram-engine/types"

/**
 * Real output from drawio-ai-kit's examples/aws/build_vpc.mjs — the exact XML shape the
 * parser has to handle. Structure declared by that script:
 *
 *   root (phantom, row)
 *     ├── users (box)
 *     └── region (group_region, row)
 *           ├── vpc (group_vpc, col)
 *           │     ├── igw, alb (icons)
 *           │     └── azs (phantom, row)
 *           │           ├── az_a (group_availability_zone, col) → pub_a/app_a/db_a → nat_a/ec2_a/rds_a
 *           │           └── az_b (same, mirrored)
 *           └── reg_svc (plain frame, col) → waf, cw, s3
 *
 * The two phantoms emit no cell, so their children are reparented to the nearest
 * visible ancestor: users/region become roots, az_a/az_b become children of vpc.
 */
const ENGINE_XML = readFileSync(
    join(__dirname, "fixtures/engine-vpc-multiaz.drawio"),
    "utf8",
)

/** Minimal page, built by hand so each test controls exactly one variable. */
function page(cells: string): string {
    return `<mxfile host="app.diagrams.net"><diagram name="Page-1" id="p1"><mxGraphModel dx="1400" dy="900" grid="0" pageWidth="1200" pageHeight="800"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`
}
function vtx(
    id: string,
    style: string,
    geo: { x: number; y: number; w: number; h: number },
    opts: { parent?: string; value?: string } = {},
): string {
    return `<mxCell id="${id}" value="${opts.value ?? ""}" style="${style}" vertex="1" parent="${opts.parent ?? "1"}"><mxGeometry x="${geo.x}" y="${geo.y}" width="${geo.w}" height="${geo.h}" as="geometry"/></mxCell>`
}
const AWS_GROUP = (name: string) =>
    `sketch=0;outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=12;shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.${name};strokeColor=#879196;fillColor=none;verticalAlign=top;align=left;spacingLeft=30;`
const RES_ICON = (name: string) =>
    `sketch=0;outlineConnect=0;fillColor=#ED7100;strokeColor=none;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.${name};`
const OWN_SHAPE_ICON = (name: string) =>
    `sketch=0;outlineConnect=0;fillColor=#ED7100;strokeColor=none;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;aspect=fixed;shape=mxgraph.aws4.${name};`
const IMAGE_ICON =
    "sketch=0;html=1;outlineConnect=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontColor=#232F3E;aspect=fixed;shape=image;image=data:image/png,iVBORw0KGgoAAAANSUhEUg==;"
const PLAIN_BOX =
    "rounded=0;whiteSpace=wrap;html=1;fillColor=#DAE8FC;strokeColor=#6C8EBF;"

describe("extractPage", () => {
    it("pulls the model body out of an mxfile", () => {
        const p = extractPage(ENGINE_XML)
        expect(p).toContain("<mxCell")
        expect(p).not.toContain("<mxfile")
    })

    it("accepts a bare mxGraphModel", () => {
        const bare = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>`
        expect(extractPage(bare)).toContain("<mxCell")
    })

    it("returns null for a compressed page rather than pretending it is empty", () => {
        const compressed = `<mxfile><diagram name="Page-1" id="p1">7VvbcuI4EP0aHmfL8oXLY0gyu1O1t</diagram></mxfile>`
        expect(extractPage(compressed)).toBeNull()
    })

    it("selects the requested page and clamps an out-of-range index", () => {
        const two = `<mxfile><diagram name="A" id="a"><mxGraphModel><root><mxCell id="0"/><mxCell id="onlyA"/></root></mxGraphModel></diagram><diagram name="B" id="b"><mxGraphModel><root><mxCell id="0"/><mxCell id="onlyB"/></root></mxGraphModel></diagram></mxfile>`
        expect(extractPage(two, 0)).toContain("onlyA")
        expect(extractPage(two, 1)).toContain("onlyB")
        expect(extractPage(two, 99)).toContain("onlyB")
    })
})

describe("countPages", () => {
    it("counts a multi-page deck", () => {
        const two = `<mxfile><diagram name="A" id="a"></diagram><diagram name="B" id="b"></diagram></mxfile>`
        expect(countPages(two)).toBe(2)
    })

    it("reports 1 for a single page", () => {
        expect(countPages(ENGINE_XML)).toBe(1)
    })
})

describe("parseDiagram on real engine output", () => {
    const { tree, needsAdoption, warnings } = parseDiagram(ENGINE_XML)

    it("recovers the nesting the build script declared", () => {
        // az_a is a child of vpc (the `azs` phantom emitted no cell)
        expect(findParent(tree, "az_a")?.id).toBe("vpc")
        expect(findParent(tree, "vpc")?.id).toBe("region")
        expect(findParent(tree, "ec2_a")?.id).toBe("app_a")
        expect(findParent(tree, "app_a")?.id).toBe("az_a")
        expect(findParent(tree, "rds_b")?.id).toBe("db_b")
    })

    it("puts users and region at the top level", () => {
        const rootIds = tree.roots.map((r) => r.id).sort()
        expect(rootIds).toEqual(["region", "users"])
    })

    it("classifies AWS group stencils as containers and keeps their stencil name", () => {
        const vpc = findNode(tree, "vpc")
        expect(isContainer(vpc as DiagramNode)).toBe(true)
        expect((vpc as ContainerNode).gname).toBe("group_vpc")
        expect((findNode(tree, "az_a") as ContainerNode).gname).toBe(
            "group_availability_zone",
        )
        expect((findNode(tree, "pub_a") as ContainerNode).gname).toBe(
            "group_subnet",
        )
    })

    it("cannot recover a direction the phantom erased — the case that rules phantoms out", () => {
        // The build script declared vpc as dir:"col" holding igw, alb, and a phantom
        // wrapping the two AZ columns. A phantom emits NO cell, so its children were
        // reparented onto vpc: igw(260,60) alb(260,164) az_a(24,268) az_b(309,268).
        // That is a 2-D arrangement, so inference correctly reads "grid" — the original
        // column structure is simply not in the XML any more.
        //
        // This is why our engine must not have phantoms: a wrapper that emits no cell
        // makes the round-trip lossy by construction. See task #5.
        expect(findNode(tree, "vpc")?.kind).toBe("grid")
        expect(findParent(tree, "az_a")?.id).toBe("vpc")
        expect(findNode(tree, "azs")).toBeNull()
    })

    it("classifies resourceIcon cells as icons and recovers their catalog name", () => {
        const ec2 = findNode(tree, "ec2_a")
        expect(ec2?.kind).toBe("icon")
        expect(ec2 && "name" in ec2 ? ec2.name : null).toBe("ec2")
        const nat = findNode(tree, "nat_a")
        expect(nat && "name" in nat ? nat.name : null).toBe("nat_gateway")
    })

    it("classifies a plain rectangle as a box", () => {
        expect(findNode(tree, "users")?.kind).toBe("box")
    })

    it("lifts the title out of the flow instead of leaving it as a node", () => {
        expect(tree.title).toContain("VPC Multi-AZ 3-tier")
        expect(findNode(tree, "__title")).toBeNull()
    })

    it("recovers every edge with its endpoints", () => {
        expect(tree.links).toHaveLength(7)
        const pairs = tree.links.map((l) => `${l.source}->${l.target}`)
        expect(pairs).toContain("users->igw")
        expect(pairs).toContain("alb->ec2_a")
        expect(pairs).toContain("rds_a->rds_b")
    })

    it("splits a step number off the edge label", () => {
        const first = tree.links.find(
            (l) => l.source === "users" && l.target === "igw",
        )
        expect(first?.step).toBe(1)
        expect(first?.label).toBe("HTTPS")
    })

    it("marks a dashed edge", () => {
        const repl = tree.links.find(
            (l) => l.source === "rds_a" && l.target === "rds_b",
        )
        expect(repl?.dashed).toBe(true)
        expect(repl?.label).toBe("Multi-AZ replication")
    })

    it("flags the diagram as needing adoption — it carries no markers yet", () => {
        // This fixture predates the marker scheme, so direction had to be inferred.
        expect(needsAdoption).toBe(true)
    })

    it("parses without warnings on a well-formed single page", () => {
        expect(warnings).toEqual([])
    })

    it("assigns every cell exactly once — no duplicates, nothing lost", () => {
        const ids = [...walkTree(tree)].map((n) => n.id)
        expect(new Set(ids).size).toBe(ids.length)
        // 24 vertex cells in the fixture, minus __title which is lifted out of the flow
        expect(ids).toHaveLength(23)
    })
})

describe("layout inference (no markers present)", () => {
    it("reads a row from children spread along x", () => {
        const xml = page(
            vtx("f", AWS_GROUP("group_vpc"), { x: 0, y: 0, w: 400, h: 120 }) +
                vtx(
                    "a",
                    RES_ICON("s3"),
                    { x: 20, y: 40, w: 48, h: 48 },
                    { parent: "f" },
                ) +
                vtx(
                    "b",
                    RES_ICON("ec2"),
                    { x: 120, y: 40, w: 48, h: 48 },
                    { parent: "f" },
                ) +
                vtx(
                    "c",
                    RES_ICON("rds"),
                    { x: 220, y: 40, w: 48, h: 48 },
                    { parent: "f" },
                ),
        )
        const f = findNode(parseDiagram(xml).tree, "f") as ContainerNode
        expect(f.kind).toBe("group")
        expect((f as { dir?: string }).dir).toBe("row")
    })

    it("reads a column from children spread along y", () => {
        const xml = page(
            vtx("f", AWS_GROUP("group_vpc"), { x: 0, y: 0, w: 120, h: 400 }) +
                vtx(
                    "a",
                    RES_ICON("s3"),
                    { x: 30, y: 20, w: 48, h: 48 },
                    { parent: "f" },
                ) +
                vtx(
                    "b",
                    RES_ICON("ec2"),
                    { x: 30, y: 120, w: 48, h: 48 },
                    { parent: "f" },
                ) +
                vtx(
                    "c",
                    RES_ICON("rds"),
                    { x: 30, y: 220, w: 48, h: 48 },
                    { parent: "f" },
                ),
        )
        const f = findNode(parseDiagram(xml).tree, "f") as ContainerNode
        expect((f as { dir?: string }).dir).toBe("col")
    })

    it("recognises a 2-D arrangement as a grid rather than forcing row or column", () => {
        const xml = page(
            vtx("f", AWS_GROUP("group_vpc"), { x: 0, y: 0, w: 300, h: 300 }) +
                vtx(
                    "a",
                    RES_ICON("s3"),
                    { x: 20, y: 20, w: 48, h: 48 },
                    { parent: "f" },
                ) +
                vtx(
                    "b",
                    RES_ICON("ec2"),
                    { x: 140, y: 20, w: 48, h: 48 },
                    { parent: "f" },
                ) +
                vtx(
                    "c",
                    RES_ICON("rds"),
                    { x: 20, y: 140, w: 48, h: 48 },
                    { parent: "f" },
                ) +
                vtx(
                    "d",
                    RES_ICON("sqs"),
                    { x: 140, y: 140, w: 48, h: 48 },
                    { parent: "f" },
                ),
        )
        const f = findNode(parseDiagram(xml).tree, "f")
        expect(f?.kind).toBe("grid")
    })

    it("measures the gap between neighbours, not between their origins", () => {
        // icons 48 wide at x=20,120,220 → edge-to-edge gap is 52
        const xml = page(
            vtx("f", AWS_GROUP("group_vpc"), { x: 0, y: 0, w: 400, h: 120 }) +
                vtx(
                    "a",
                    RES_ICON("s3"),
                    { x: 20, y: 40, w: 48, h: 48 },
                    { parent: "f" },
                ) +
                vtx(
                    "b",
                    RES_ICON("ec2"),
                    { x: 120, y: 40, w: 48, h: 48 },
                    { parent: "f" },
                ) +
                vtx(
                    "c",
                    RES_ICON("rds"),
                    { x: 220, y: 40, w: 48, h: 48 },
                    { parent: "f" },
                ),
        )
        const f = findNode(parseDiagram(xml).tree, "f") as ContainerNode
        expect((f as { gap?: number }).gap).toBe(52)
    })
})

describe("markers take precedence over inference", () => {
    it("believes dai_dir even when the geometry suggests otherwise", () => {
        // children are laid out in a row, but the marker says col
        const marked = stampContainer(AWS_GROUP("group_vpc"), {
            kind: "group",
            dir: "col",
            gap: 33,
        })
        const xml = page(
            vtx("f", marked, { x: 0, y: 0, w: 400, h: 120 }) +
                vtx(
                    "a",
                    RES_ICON("s3"),
                    { x: 20, y: 40, w: 48, h: 48 },
                    { parent: "f" },
                ) +
                vtx(
                    "b",
                    RES_ICON("ec2"),
                    { x: 120, y: 40, w: 48, h: 48 },
                    { parent: "f" },
                ),
        )
        const f = findNode(parseDiagram(xml).tree, "f") as ContainerNode
        expect((f as { dir?: string }).dir).toBe("col")
        expect((f as { gap?: number }).gap).toBe(33)
    })

    it("clears needsAdoption once any cell carries a marker", () => {
        const marked = stampContainer(AWS_GROUP("group_vpc"), {
            kind: "group",
            dir: "row",
            gap: 20,
        })
        const xml = page(vtx("f", marked, { x: 0, y: 0, w: 200, h: 100 }))
        expect(parseDiagram(xml).needsAdoption).toBe(false)
    })

    it("recovers grid columns from dai_cols", () => {
        const marked = stampContainer("rounded=0;html=1;", {
            kind: "grid",
            dir: "grid",
            gap: 14,
            cols: 3,
        })
        const xml = page(
            vtx("g", marked, { x: 0, y: 0, w: 300, h: 200 }) +
                vtx(
                    "a",
                    RES_ICON("s3"),
                    { x: 10, y: 10, w: 48, h: 48 },
                    { parent: "g" },
                ),
        )
        const g = findNode(parseDiagram(xml).tree, "g")
        expect(g?.kind).toBe("grid")
        expect((g as { cols?: number }).cols).toBe(3)
    })

    it("carries a user pin through to the node", () => {
        const xml = page(
            vtx("b", `${PLAIN_BOX}dai_kind=box;dai_pin=1;`, {
                x: 10,
                y: 10,
                w: 120,
                h: 60,
            }),
        )
        const b = findNode(parseDiagram(xml).tree, "b")
        expect((b as { pinned?: boolean }).pinned).toBe(true)
    })
})

describe("icon classification covers all four encodings", () => {
    it("handles resIcon=, bare shape=, and shape=image", () => {
        // 554 AWS icons use resIcon; 429 use their own shape=; Azure/GCP use shape=image.
        const xml = page(
            vtx("res", RES_ICON("ec2"), { x: 0, y: 0, w: 48, h: 48 }) +
                vtx("own", OWN_SHAPE_ICON("a1_instance"), {
                    x: 100,
                    y: 0,
                    w: 48,
                    h: 48,
                }) +
                vtx("img", IMAGE_ICON, { x: 200, y: 0, w: 48, h: 48 }),
        )
        const { tree } = parseDiagram(xml)
        expect(findNode(tree, "res")?.kind).toBe("icon")
        expect(findNode(tree, "own")?.kind).toBe("icon")
        expect(findNode(tree, "img")?.kind).toBe("icon")
    })

    it("recovers the catalog name from a bare shape= icon", () => {
        const xml = page(
            vtx("own", OWN_SHAPE_ICON("a1_instance"), {
                x: 0,
                y: 0,
                w: 48,
                h: 48,
            }),
        )
        const n = findNode(parseDiagram(xml).tree, "own")
        expect(n && "name" in n ? n.name : null).toBe("a1_instance")
    })

    it("leaves the name empty for an embedded-image icon instead of inventing one", () => {
        const xml = page(vtx("img", IMAGE_ICON, { x: 0, y: 0, w: 48, h: 48 }))
        const n = findNode(parseDiagram(xml).tree, "img")
        expect(n && "name" in n ? n.name : null).toBe("")
        // ...but the verbatim style is kept, so it can be re-emitted unchanged
        expect(n && "style" in n ? n.style : "").toContain("data:image/png")
    })
})

describe("nesting when a frame lacks container=1", () => {
    it("re-homes a cell that visually sits inside a loose frame", () => {
        // draw.io will NOT reparent into a frame without container=1 (verified
        // in-browser), so the user's drop leaves parent="1" while the shape is
        // visually inside. Geometry is the truth here.
        const xml = page(
            vtx("loose", AWS_GROUP("group_vpc"), {
                x: 100,
                y: 100,
                w: 400,
                h: 300,
            }) +
                vtx("inside", RES_ICON("ec2"), {
                    x: 200,
                    y: 200,
                    w: 48,
                    h: 48,
                }),
        )
        const { tree } = parseDiagram(xml)
        expect(findParent(tree, "inside")?.id).toBe("loose")
    })

    it("picks the innermost frame when loose frames nest", () => {
        const xml = page(
            vtx("outer", AWS_GROUP("group_region"), {
                x: 0,
                y: 0,
                w: 800,
                h: 600,
            }) +
                vtx("inner", AWS_GROUP("group_vpc"), {
                    x: 100,
                    y: 100,
                    w: 300,
                    h: 200,
                }) +
                vtx("leaf", RES_ICON("ec2"), { x: 150, y: 150, w: 48, h: 48 }),
        )
        const { tree } = parseDiagram(xml)
        expect(findParent(tree, "leaf")?.id).toBe("inner")
    })

    it("leaves a cell alone when it is outside every loose frame", () => {
        const xml = page(
            vtx("loose", AWS_GROUP("group_vpc"), {
                x: 100,
                y: 100,
                w: 200,
                h: 200,
            }) +
                vtx("outside", RES_ICON("ec2"), {
                    x: 600,
                    y: 600,
                    w: 48,
                    h: 48,
                }),
        )
        const { tree } = parseDiagram(xml)
        expect(findParent(tree, "outside")).toBeNull()
        expect(tree.roots.map((r) => r.id)).toContain("outside")
    })

    it("does NOT override an explicit parent that draw.io maintained", () => {
        // With container=1 the parent attribute is authoritative — even if a stale
        // geometry would place the child inside a different frame.
        const withContainer = stampContainer(AWS_GROUP("group_vpc"), {
            kind: "group",
            dir: "row",
            gap: 20,
        })
        const xml = page(
            vtx("real", withContainer, { x: 500, y: 0, w: 300, h: 200 }) +
                vtx("loose", AWS_GROUP("group_region"), {
                    x: 0,
                    y: 0,
                    w: 400,
                    h: 400,
                }) +
                // parent says "real"; geometry (relative to real) lands it at 520,20
                vtx(
                    "kid",
                    RES_ICON("ec2"),
                    { x: 20, y: 20, w: 48, h: 48 },
                    { parent: "real" },
                ),
        )
        const { tree } = parseDiagram(xml)
        expect(findParent(tree, "kid")?.id).toBe("real")
    })
})

describe("robustness", () => {
    it("returns an empty tree with a warning for a compressed file", () => {
        const compressed = `<mxfile><diagram name="Page-1" id="p1">7VvbcuI4EP0aHmfLGHN5DCQzu1O1t</diagram></mxfile>`
        const r = parseDiagram(compressed)
        expect(r.tree.roots).toEqual([])
        expect(r.warnings[0]).toContain("compressed")
    })

    it("warns when it silently parsed only the first page of a deck", () => {
        const two = `<mxfile><diagram name="A" id="a"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${vtx("a", PLAIN_BOX, { x: 0, y: 0, w: 100, h: 50 })}</root></mxGraphModel></diagram><diagram name="B" id="b"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`
        const r = parseDiagram(two)
        expect(r.warnings.some((w) => w.includes("2 pages"))).toBe(true)
    })

    it("treats a cell whose parent does not exist as a root instead of dropping it", () => {
        const xml = page(
            vtx(
                "orphan",
                PLAIN_BOX,
                { x: 0, y: 0, w: 100, h: 50 },
                { parent: "ghost" },
            ),
        )
        const { tree } = parseDiagram(xml)
        expect(tree.roots.map((r) => r.id)).toContain("orphan")
    })

    it("does not hang on a parent cycle", () => {
        const cyclic = page(
            vtx(
                "a",
                PLAIN_BOX,
                { x: 0, y: 0, w: 100, h: 50 },
                { parent: "b" },
            ) +
                vtx(
                    "b",
                    PLAIN_BOX,
                    { x: 0, y: 0, w: 100, h: 50 },
                    { parent: "a" },
                ),
        )
        const r = parseDiagram(cyclic)
        expect(r.warnings.some((w) => w.includes("cycle"))).toBe(true)
    })

    it("unescapes entities in labels", () => {
        const xml = page(
            vtx(
                "b",
                PLAIN_BOX,
                { x: 0, y: 0, w: 100, h: 50 },
                {
                    value: "A &amp; B &lt;tag&gt; &quot;q&quot;",
                },
            ),
        )
        const b = findNode(parseDiagram(xml).tree, "b")
        expect((b as { label?: string }).label).toBe('A & B <tag> "q"')
    })

    it("keeps cells on the boundaries layer verbatim instead of restructuring them", () => {
        const xml = page(
            `<mxCell id="boundaries" value="Stack boundaries (locked)" parent="0" style="locked=1;"/>` +
                vtx(
                    "cluster",
                    "rounded=0;dashed=1;fillColor=none;strokeColor=#ED7100;",
                    {
                        x: 10,
                        y: 10,
                        w: 200,
                        h: 100,
                    },
                    { parent: "boundaries" },
                ),
        )
        const { tree } = parseDiagram(xml)
        expect(tree.foreign.map((f) => f.id)).toContain("cluster")
        expect(findNode(tree, "cluster")).toBeNull()
        expect(tree.foreign[0].xml).toContain("strokeColor=#ED7100")
    })

    it("ignores an edge that is missing an endpoint", () => {
        const xml = page(
            vtx("a", PLAIN_BOX, { x: 0, y: 0, w: 100, h: 50 }) +
                `<mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="a"><mxGeometry relative="1" as="geometry"/></mxCell>`,
        )
        expect(parseDiagram(xml).tree.links).toHaveLength(0)
    })

    it("handles a self-closing mxCell", () => {
        const xml = page(
            `<mxCell id="bare" value="x" style="${PLAIN_BOX}" vertex="1" parent="1"/>`,
        )
        const { tree } = parseDiagram(xml)
        expect(tree.roots.map((r) => r.id)).toContain("bare")
    })
})

describe("container classification edge cases", () => {
    it("treats a plain box that has children as a container", () => {
        const xml = page(
            vtx("frame", PLAIN_BOX, { x: 0, y: 0, w: 300, h: 200 }) +
                vtx(
                    "kid",
                    RES_ICON("s3"),
                    { x: 20, y: 20, w: 48, h: 48 },
                    { parent: "frame" },
                ),
        )
        const f = findNode(parseDiagram(xml).tree, "frame")
        expect(f?.kind).toBe("group")
        expect(isContainer(f as DiagramNode)).toBe(true)
    })

    it("treats a childless container=1 frame as a container, not a box", () => {
        const xml = page(
            vtx("empty", `${PLAIN_BOX}container=1;`, {
                x: 0,
                y: 0,
                w: 200,
                h: 100,
            }),
        )
        expect(findNode(parseDiagram(xml).tree, "empty")?.kind).toBe("group")
    })

    it("honours the last container= value when the key is duplicated", () => {
        // Verified in-browser: draw.io resolves duplicate keys last-wins.
        const xml = page(
            vtx("c", `${PLAIN_BOX}container=1;container=0;`, {
                x: 0,
                y: 0,
                w: 200,
                h: 100,
            }),
        )
        // last value is 0 → not a container, and it has no children → a box
        expect(findNode(parseDiagram(xml).tree, "c")?.kind).toBe("box")
    })

    it("recognises a text cell as the title even without the __title id", () => {
        const xml = page(
            `<mxCell id="t9" value="My Diagram" style="text;html=1;align=center;fontSize=14;" vertex="1" parent="1"><mxGeometry x="0" y="24" width="800" height="30" as="geometry"/></mxCell>`,
        )
        const { tree } = parseDiagram(xml)
        expect(tree.title).toBe("My Diagram")
        expect(findNode(tree, "t9")).toBeNull()
    })

    it("keeps the first title when a diagram somehow has two", () => {
        const xml = page(
            `<mxCell id="t1" value="First" style="text;html=1;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="100" height="30" as="geometry"/></mxCell>` +
                `<mxCell id="t2" value="Second" style="text;html=1;" vertex="1" parent="1"><mxGeometry x="0" y="40" width="100" height="30" as="geometry"/></mxCell>`,
        )
        expect(parseDiagram(xml).tree.title).toBe("First")
    })
})

describe("geometry resolution", () => {
    it("resolves a nested cell's position to page coordinates", () => {
        const withContainer = stampContainer(AWS_GROUP("group_vpc"), {
            kind: "group",
            dir: "row",
            gap: 20,
        })
        const xml = page(
            vtx("outer", withContainer, { x: 100, y: 200, w: 400, h: 300 }) +
                vtx(
                    "kid",
                    `${RES_ICON("ec2")}dai_kind=icon;dai_pin=1;`,
                    {
                        x: 30,
                        y: 40,
                        w: 48,
                        h: 48,
                    },
                    { parent: "outer" },
                ),
        )
        const kid = findNode(parseDiagram(xml).tree, "kid")
        // 100+30, 200+40
        expect((kid as { rect?: { x: number; y: number } }).rect).toEqual({
            x: 130,
            y: 240,
            w: 48,
            h: 48,
        })
    })

    it("resolves through two levels of nesting", () => {
        const c = stampContainer(AWS_GROUP("group_vpc"), {
            kind: "group",
            dir: "col",
            gap: 10,
        })
        const xml = page(
            vtx("l1", c, { x: 100, y: 100, w: 500, h: 400 }) +
                vtx(
                    "l2",
                    c,
                    { x: 50, y: 60, w: 300, h: 200 },
                    { parent: "l1" },
                ) +
                vtx(
                    "leaf",
                    `${RES_ICON("s3")}dai_kind=icon;dai_pin=1;`,
                    {
                        x: 10,
                        y: 20,
                        w: 48,
                        h: 48,
                    },
                    { parent: "l2" },
                ),
        )
        const leaf = findNode(parseDiagram(xml).tree, "leaf")
        // 100+50+10, 100+60+20
        expect((leaf as { rect?: { x: number; y: number } }).rect?.x).toBe(160)
        expect((leaf as { rect?: { x: number; y: number } }).rect?.y).toBe(180)
    })
})
