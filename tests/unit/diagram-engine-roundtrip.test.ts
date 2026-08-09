/**
 * Round-trip: tree → XML → tree.
 *
 * This is the test the whole design rests on. If structure does not survive a trip
 * through draw.io XML, then the canvas cannot be the single source of truth and we are
 * back to keeping a second copy of the state in sync.
 */
import { describe, expect, it } from "vitest"
import { parseDiagram } from "@/lib/diagram-engine/parse"
import { renderDiagram } from "@/lib/diagram-engine/render"
import {
    type BoxNode,
    type ContainerNode,
    type DiagramNode,
    type DiagramTree,
    findNode,
    findParent,
    type GridNode,
    type GroupNode,
    type IconNode,
    isContainer,
    walkTree,
} from "@/lib/diagram-engine/types"

const icon = (id: string, name = "ec2", label = ""): IconNode => ({
    kind: "icon",
    id,
    name,
    label,
})
const box = (id: string, label = ""): BoxNode => ({ kind: "box", id, label })
const group = (
    id: string,
    dir: "row" | "col",
    children: DiagramNode[],
    label = "",
    gname: string | null = null,
    gap = 20,
): GroupNode => ({ kind: "group", id, gname, label, dir, gap, children })
const grid = (
    id: string,
    cols: number,
    children: DiagramNode[],
    label = "",
    gap = 14,
): GridNode => ({ kind: "grid", id, gname: null, label, cols, gap, children })

const tree = (
    roots: DiagramNode[],
    extra: Partial<DiagramTree> = {},
): DiagramTree => ({
    roots,
    links: [],
    foreign: [],
    ...extra,
})

/** Structural signature: nesting, kinds, directions and order — everything but coordinates. */
function signature(t: DiagramTree): string {
    const line = (n: DiagramNode, depth: number): string[] => {
        const pad = "  ".repeat(depth)
        if (!isContainer(n)) return [`${pad}${n.kind} ${n.id}`]
        const meta =
            n.kind === "grid"
                ? `cols=${n.cols}`
                : n.kind === "group"
                  ? `dir=${n.dir}`
                  : n.kind
        return [
            `${pad}${n.kind} ${n.id} ${meta} gap=${n.gap}`,
            ...n.children.flatMap((c) => line(c, depth + 1)),
        ]
    }
    return t.roots.flatMap((r) => line(r, 0)).join("\n")
}

/** Render then parse, returning the recovered tree. */
function roundTrip(t: DiagramTree) {
    const { xml } = renderDiagram(t)
    return { xml, ...parseDiagram(xml) }
}

describe("structure survives a round-trip", () => {
    it("recovers a flat row", () => {
        const t = tree([group("f", "row", [icon("a"), icon("b")], "Frame")])
        expect(signature(roundTrip(t).tree)).toBe(signature(t))
    })

    it("recovers a column", () => {
        const t = tree([group("f", "col", [icon("a"), icon("b")], "Frame")])
        expect(signature(roundTrip(t).tree)).toBe(signature(t))
    })

    it("recovers a grid with its column count", () => {
        const t = tree([
            grid("g", 3, [icon("a"), icon("b"), icon("c"), icon("d")], "G"),
        ])
        expect(signature(roundTrip(t).tree)).toBe(signature(t))
    })

    it("recovers a deep cloud-architecture nesting", () => {
        const t = tree([
            group(
                "region",
                "row",
                [
                    group(
                        "vpc",
                        "col",
                        [
                            icon("igw", "internet_gateway", "IGW"),
                            group(
                                "az_a",
                                "col",
                                [
                                    group(
                                        "pub_a",
                                        "col",
                                        [icon("nat_a", "nat_gateway", "NAT")],
                                        "Public Subnet",
                                        "group_subnet",
                                    ),
                                    group(
                                        "app_a",
                                        "col",
                                        [icon("ec2_a", "ec2", "EC2")],
                                        "Private Subnet",
                                        "group_subnet",
                                    ),
                                ],
                                "AZ-a",
                                "group_availability_zone",
                            ),
                        ],
                        "VPC",
                        "group_vpc",
                    ),
                ],
                "Region",
                "group_region",
            ),
        ])
        expect(signature(roundTrip(t).tree)).toBe(signature(t))
    })

    it("recovers several roots in order", () => {
        const t = tree([
            box("users", "Users"),
            group("cloud", "row", [icon("a")], "Cloud"),
            box("consumers", "Consumers"),
        ])
        const back = roundTrip(t).tree
        expect(back.roots.map((r) => r.id)).toEqual([
            "users",
            "cloud",
            "consumers",
        ])
    })

    it("recovers the direction of an UNLABELLED wrapper — the phantom problem, fixed", () => {
        // The reference project would use a phantom here, which emits no cell: its two
        // children would be reparented onto vpc, and the wrapper's "row" direction would
        // be gone from the XML for good. We emit a real but invisible cell instead.
        const t = tree([
            group(
                "vpc",
                "col",
                [
                    icon("igw", "internet_gateway", "IGW"),
                    group(
                        "azs",
                        "row",
                        [
                            group("az_a", "col", [icon("ec2_a")], "AZ-a"),
                            group("az_b", "col", [icon("ec2_b")], "AZ-b"),
                        ],
                        "", // no label — a layout-only wrapper
                    ),
                ],
                "VPC",
                "group_vpc",
            ),
        ])
        const back = roundTrip(t).tree
        // the wrapper is still there, still a row, still holding both AZs
        const azs = findNode(back, "azs")
        expect(azs).not.toBeNull()
        expect((azs as GroupNode).dir).toBe("row")
        expect(findParent(back, "az_a")?.id).toBe("azs")
        expect(findParent(back, "azs")?.id).toBe("vpc")
        // and vpc kept its own direction instead of collapsing into a grid
        expect((findNode(back, "vpc") as GroupNode).dir).toBe("col")
        expect(signature(back)).toBe(signature(t))
    })

    it("keeps the wrapper invisible", () => {
        const t = tree([
            group("w", "row", [icon("a"), icon("b")], ""), // unlabelled → invisible
        ])
        const { xml } = renderDiagram(t)
        const cell = xml.match(/<mxCell id="w"[^>]*style="([^"]*)"/)?.[1] ?? ""
        expect(cell).toContain("fillColor=none")
        expect(cell).toContain("strokeColor=none")
        // ...but it is still a real container, so draw.io reparents into it
        expect(cell).toContain("container=1")
    })

    it("keeps a labelled frame visible", () => {
        const t = tree([group("f", "row", [icon("a")], "Visible")])
        const { xml } = renderDiagram(t)
        const style = xml.match(/<mxCell id="f"[^>]*style="([^"]*)"/)?.[1] ?? ""
        expect(style).not.toContain("strokeColor=none")
    })

    it("survives repeated round-trips without drift", () => {
        const t = tree([
            group(
                "outer",
                "row",
                [
                    group("a", "col", [icon("x"), icon("y")], "A"),
                    grid("g", 2, [icon("p"), icon("q"), icon("r")], "G"),
                ],
                "Outer",
            ),
        ])
        const once = roundTrip(t).tree
        const twice = roundTrip(once).tree
        const thrice = roundTrip(twice).tree
        expect(signature(twice)).toBe(signature(once))
        expect(signature(thrice)).toBe(signature(once))
    })

    it("keeps geometry stable across repeated round-trips", () => {
        const t = tree([group("f", "row", [icon("a"), icon("b")], "F")])
        const first = renderDiagram(t)
        const second = renderDiagram(parseDiagram(first.xml).tree)
        expect(second.page).toEqual(first.page)
    })
})

describe("labels and content survive", () => {
    it("recovers labels on containers and leaves", () => {
        const t = tree([
            group(
                "f",
                "row",
                [icon("a", "s3", "My Bucket"), box("b", "A Box")],
                "My Frame",
            ),
        ])
        const back = roundTrip(t).tree
        expect((findNode(back, "f") as ContainerNode).label).toBe("My Frame")
        expect((findNode(back, "a") as IconNode).label).toBe("My Bucket")
        expect((findNode(back, "b") as BoxNode).label).toBe("A Box")
    })

    it("recovers a label containing XML metacharacters", () => {
        const nasty = "A & B <tag> \"quoted\" 'apostrophe'"
        const t = tree([group("f", "row", [box("b", nasty)], nasty)])
        const back = roundTrip(t).tree
        expect((findNode(back, "b") as BoxNode).label).toBe(nasty)
        expect((findNode(back, "f") as ContainerNode).label).toBe(nasty)
    })

    it("recovers the page title", () => {
        const t = tree([group("f", "row", [icon("a")], "F")], {
            title: "My Architecture",
        })
        expect(roundTrip(t).tree.title).toBe("My Architecture")
    })

    it("recovers a gap that is not the default", () => {
        const t = tree([
            group("f", "row", [icon("a"), icon("b")], "F", null, 47),
        ])
        expect((findNode(roundTrip(t).tree, "f") as GroupNode).gap).toBe(47)
    })

    it("recovers an icon's catalog name", () => {
        const t = tree([
            group(
                "f",
                "row",
                [icon("a", "nat_gateway"), icon("b", "rds")],
                "F",
            ),
        ])
        const back = roundTrip(t).tree
        expect((findNode(back, "a") as IconNode).name).toBe("nat_gateway")
        expect((findNode(back, "b") as IconNode).name).toBe("rds")
    })

    it("recovers a group stencil name", () => {
        const t = tree([group("v", "col", [icon("a")], "VPC", "group_vpc")])
        const { xml } = renderDiagram(t, {
            resolveStyle: (name, kind) =>
                kind === "group"
                    ? `shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.${name};fillColor=none;strokeColor=#8C4FFF;verticalAlign=top;align=left;`
                    : null,
        })
        expect((findNode(parseDiagram(xml).tree, "v") as GroupNode).gname).toBe(
            "group_vpc",
        )
    })
})

describe("edges survive", () => {
    it("recovers source, target and label", () => {
        const t = tree([group("f", "row", [icon("a"), icon("b")], "F")], {
            links: [{ source: "a", target: "b", label: "flows to" }],
        })
        const back = roundTrip(t).tree
        expect(back.links).toHaveLength(1)
        expect(back.links[0].source).toBe("a")
        expect(back.links[0].target).toBe("b")
        expect(back.links[0].label).toBe("flows to")
    })

    it("recovers a step number and keeps it out of the label", () => {
        const t = tree([group("f", "row", [icon("a"), icon("b")], "F")], {
            links: [{ source: "a", target: "b", label: "HTTPS", step: 1 }],
        })
        const back = roundTrip(t).tree
        expect(back.links[0].step).toBe(1)
        expect(back.links[0].label).toBe("HTTPS")
    })

    it("recovers a dashed edge", () => {
        const t = tree([group("f", "row", [icon("a"), icon("b")], "F")], {
            links: [{ source: "a", target: "b", dashed: true }],
        })
        expect(roundTrip(t).tree.links[0].dashed).toBe(true)
    })

    it("drops an edge with a missing endpoint and reports it", () => {
        const t = tree([group("f", "row", [icon("a")], "F")], {
            links: [{ source: "a", target: "ghost" }],
        })
        const r = renderDiagram(t)
        expect(r.danglingLinks).toEqual(["ghost"])
        expect(r.xml).not.toContain('target="ghost"')
    })

    it("emits no waypoints, so draw.io re-routes when the user moves a node", () => {
        const t = tree([group("f", "row", [icon("a"), icon("b")], "F")], {
            links: [{ source: "a", target: "b", label: "x" }],
        })
        expect(renderDiagram(t).xml).not.toContain('as="points"')
    })
})

describe("foreign cells survive", () => {
    it("re-emits an unrecognised cell verbatim", () => {
        const custom =
            '<mxCell id="note" value="hand-written note" style="shape=note;whiteSpace=wrap;html=1;fillColor=#FFF2CC;" vertex="1" parent="1"><mxGeometry x="900" y="40" width="160" height="80" as="geometry"/></mxCell>'
        const t = tree([group("f", "row", [icon("a")], "F")], {
            foreign: [{ id: "note", xml: custom, parent: "1" }],
        })
        expect(renderDiagram(t).xml).toContain(custom)
    })

    it("re-creates the boundaries layer when a foreign cell needs it", () => {
        const t = tree([group("f", "row", [icon("a")], "F")], {
            foreign: [
                {
                    id: "cluster",
                    xml: '<mxCell id="cluster" value="EKS" style="dashed=1;fillColor=none;" vertex="1" parent="boundaries"><mxGeometry x="0" y="0" width="100" height="50" as="geometry"/></mxCell>',
                    parent: "boundaries",
                },
            ],
        })
        const { xml } = renderDiagram(t)
        expect(xml).toContain('<mxCell id="boundaries"')
        expect(xml.indexOf('id="boundaries"')).toBeLessThan(
            xml.indexOf('parent="boundaries"'),
        )
    })

    it("lets an edge anchor to a foreign cell", () => {
        const t = tree([group("f", "row", [icon("a")], "F")], {
            foreign: [
                {
                    id: "legend",
                    xml: '<mxCell id="legend" value="L" style="rounded=0;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="50" height="50" as="geometry"/></mxCell>',
                    parent: "1",
                },
            ],
            links: [{ source: "a", target: "legend" }],
        })
        const r = renderDiagram(t)
        expect(r.danglingLinks).toEqual([])
        expect(r.xml).toContain('target="legend"')
    })
})

describe("the emitted XML is well formed for draw.io", () => {
    const t = tree(
        [
            group(
                "region",
                "row",
                [
                    group(
                        "vpc",
                        "col",
                        [icon("a"), icon("b")],
                        "VPC",
                        "group_vpc",
                    ),
                ],
                "Region",
                "group_region",
            ),
        ],
        { title: "T", links: [{ source: "a", target: "b" }] },
    )
    const { xml } = renderDiagram(t)

    it("wraps the model in mxfile/diagram", () => {
        expect(xml.startsWith("<mxfile")).toBe(true)
        expect(xml).toContain("<diagram")
        expect(xml).toContain("<mxGraphModel")
    })

    it("includes the two root cells draw.io requires", () => {
        expect(xml).toContain('<mxCell id="0"/>')
        expect(xml).toContain('<mxCell id="1" parent="0"/>')
    })

    it("declares a parent before any cell that references it", () => {
        expect(xml.indexOf('id="region"')).toBeLessThan(
            xml.indexOf('parent="region"'),
        )
        expect(xml.indexOf('id="vpc"')).toBeLessThan(
            xml.indexOf('parent="vpc"'),
        )
    })

    it("gives every cell a unique id", () => {
        const ids = [...xml.matchAll(/<mxCell id="([^"]+)"/g)].map((m) => m[1])
        expect(new Set(ids).size).toBe(ids.length)
    })

    it("sets the page size from the content", () => {
        const w = Number(xml.match(/pageWidth="(\d+)"/)?.[1])
        const h = Number(xml.match(/pageHeight="(\d+)"/)?.[1])
        expect(w).toBeGreaterThan(0)
        expect(h).toBeGreaterThan(0)
    })

    it("writes nested geometry relative to the parent, as draw.io expects", () => {
        // vpc sits inside region, so its x must be small — an absolute x would push it
        // outside the frame when draw.io adds the parent offset.
        const vpcGeo = xml.match(
            /<mxCell id="vpc"[^>]*>\s*<mxGeometry x="(-?\d+)"/,
        )?.[1]
        expect(Number(vpcGeo)).toBeLessThan(100)
    })

    it("stamps container=1 on containers so drag-and-drop reparents correctly", () => {
        // Verified in-browser: without this, a shape dragged into the frame keeps
        // parent="1" and the nesting is lost.
        const regionStyle =
            xml.match(/<mxCell id="region"[^>]*style="([^"]*)"/)?.[1] ?? ""
        expect(regionStyle).toContain("container=1")
    })

    it("does not stamp container=1 on a leaf", () => {
        const iconStyle =
            xml.match(/<mxCell id="a"[^>]*style="([^"]*)"/)?.[1] ?? ""
        expect(iconStyle).not.toContain("container=1")
    })
})

describe("user edits are inputs, not conflicts", () => {
    it("keeps a hand-changed fill through a re-layout", () => {
        // The user recoloured a box in draw.io. Re-deriving the tree picks up the style
        // verbatim, so re-rendering preserves the colour rather than resetting it.
        const t = tree([group("f", "row", [icon("a"), box("b", "Box")], "F")])
        const first = renderDiagram(t).xml
        const edited = first.replace(
            /(<mxCell id="b"[^>]*style=")([^"]*)"/,
            '$1$2fillColor=#FF0000;"',
        )
        const back = parseDiagram(edited).tree
        expect(renderDiagram(back).xml).toContain("fillColor=#FF0000")
    })

    it("re-lays-out around a node the user dragged into a different frame", () => {
        // Two frames; the user moves icon "b" from f1 into f2. draw.io rewrites the
        // parent attribute (container=1 is in place), so the next layout puts it inside
        // f2 — no reconciliation step, the canvas simply says where things are.
        const t = tree([
            group(
                "root",
                "row",
                [
                    group("f1", "col", [icon("a"), icon("b")], "F1"),
                    group("f2", "col", [icon("c")], "F2"),
                ],
                "Root",
            ),
        ])
        const first = renderDiagram(t).xml
        const moved = first.replace(
            /(<mxCell id="b"[^>]*)parent="f1"/,
            '$1parent="f2"',
        )
        const back = parseDiagram(moved).tree
        expect(findParent(back, "b")?.id).toBe("f2")
        // and the re-render keeps it there, sized to fit
        const again = parseDiagram(renderDiagram(back).xml).tree
        expect(findParent(again, "b")?.id).toBe("f2")
    })

    it("honours a pin the user added by hand in Edit Style", () => {
        const t = tree([box("pin", "Pinned"), box("flow", "Flow")])
        const first = renderDiagram(t).xml
        const pinned = first.replace(
            /(<mxCell id="pin"[^>]*style="[^"]*)"/,
            '$1dai_pin=1;"',
        )
        const back = parseDiagram(pinned).tree
        const node = findNode(back, "pin") as BoxNode
        expect(node.pinned).toBe(true)
        const pos = node.rect
        // re-rendering leaves the pinned node exactly where it was
        const again = parseDiagram(renderDiagram(back).xml).tree
        expect((findNode(again, "pin") as BoxNode).rect).toEqual(pos)
    })

    it("does not lose a cell the user added by hand", () => {
        const t = tree([group("f", "row", [icon("a")], "F")])
        const first = renderDiagram(t).xml
        // user drops a new shape on the canvas
        const withNew = first.replace(
            "</root>",
            '<mxCell id="userbox" value="Mine" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="800" y="400" width="120" height="60" as="geometry"/></mxCell></root>',
        )
        const back = parseDiagram(withNew).tree
        const ids = [...walkTree(back)].map((n) => n.id)
        expect(ids).toContain("userbox")
        expect(renderDiagram(back).xml).toContain('id="userbox"')
    })
})
