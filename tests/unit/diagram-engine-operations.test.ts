import { describe, expect, it } from "vitest"
import {
    applyOperations,
    collectNames,
    type Operation,
    OperationSchema,
    outline,
} from "@/lib/diagram-engine/operations"
import {
    type ContainerNode,
    type DiagramNode,
    type DiagramTree,
    findNode,
    findParent,
    type GroupNode,
    walkTree,
} from "@/lib/diagram-engine/types"

const empty = (): DiagramTree => ({ roots: [], links: [], foreign: [] })

/** A small starting diagram: one frame holding two icons. */
function base(): DiagramTree {
    return {
        roots: [
            {
                kind: "group",
                id: "vpc",
                gname: "group_vpc",
                label: "VPC",
                dir: "col",
                gap: 20,
                children: [
                    {
                        kind: "icon",
                        id: "alb",
                        name: "application_load_balancer",
                        label: "ALB",
                    },
                    { kind: "icon", id: "ec2", name: "ec2", label: "EC2" },
                ],
            },
        ],
        links: [{ source: "alb", target: "ec2" }],
        foreign: [],
    }
}

const apply = (t: DiagramTree, ...ops: Operation[]) => applyOperations(t, ops)

describe("add operations", () => {
    it("adds an icon into a container", () => {
        const { tree, errors } = apply(base(), {
            op: "add_icon",
            id: "rds",
            parent: "vpc",
            name: "rds",
            label: "RDS",
        })
        expect(errors).toEqual([])
        expect(findParent(tree, "rds")?.id).toBe("vpc")
        expect((findNode(tree, "rds") as { name: string }).name).toBe("rds")
    })

    it("adds at the top level when no parent is given", () => {
        const { tree } = apply(base(), {
            op: "add_box",
            id: "users",
            label: "Users",
        })
        expect(tree.roots.map((r) => r.id)).toContain("users")
    })

    it("inserts after a named sibling", () => {
        const { tree } = apply(base(), {
            op: "add_icon",
            id: "mid",
            parent: "vpc",
            name: "s3",
            after: "alb",
        })
        const kids = (findNode(tree, "vpc") as ContainerNode).children.map(
            (c) => c.id,
        )
        expect(kids).toEqual(["alb", "mid", "ec2"])
    })

    it("appends when the named sibling does not exist", () => {
        const { tree } = apply(base(), {
            op: "add_icon",
            id: "last",
            parent: "vpc",
            name: "s3",
            after: "ghost",
        })
        const kids = (findNode(tree, "vpc") as ContainerNode).children.map(
            (c) => c.id,
        )
        expect(kids[kids.length - 1]).toBe("last")
    })

    it("adds a container and lets a later op fill it, in one batch", () => {
        const { tree, errors } = apply(
            base(),
            {
                op: "add_container",
                id: "subnet",
                parent: "vpc",
                label: "Private Subnet",
                dir: "col",
                gname: "group_subnet",
            },
            { op: "move", id: "ec2", parent: "subnet" },
        )
        expect(errors).toEqual([])
        expect(findParent(tree, "ec2")?.id).toBe("subnet")
        expect(findParent(tree, "subnet")?.id).toBe("vpc")
    })

    it("adds a grid with its column count", () => {
        const { tree } = apply(base(), {
            op: "add_grid",
            id: "area",
            parent: "vpc",
            label: "Services",
            cols: 3,
        })
        const g = findNode(tree, "area")
        expect(g?.kind).toBe("grid")
        expect((g as { cols: number }).cols).toBe(3)
    })

    it("clamps a nonsensical column count instead of producing a broken grid", () => {
        const { tree } = apply(base(), {
            op: "add_grid",
            id: "area",
            label: "X",
            cols: 0,
        })
        expect((findNode(tree, "area") as { cols: number }).cols).toBe(1)
    })

    it("rejects a duplicate id — draw.io silently drops one of two cells sharing an id", () => {
        const { errors } = apply(base(), {
            op: "add_icon",
            id: "ec2",
            parent: "vpc",
            name: "s3",
        })
        expect(errors[0]).toContain("already taken")
    })

    it("rejects adding into something that is not a container", () => {
        const { errors } = apply(base(), {
            op: "add_icon",
            id: "x",
            parent: "ec2",
            name: "s3",
        })
        expect(errors[0]).toContain("not a container")
    })

    it("rejects adding into a nonexistent parent", () => {
        const { errors } = apply(base(), {
            op: "add_icon",
            id: "x",
            parent: "ghost",
            name: "s3",
        })
        expect(errors[0]).toContain("ghost")
    })
})

describe("remove", () => {
    it("removes a leaf", () => {
        const { tree, errors } = apply(base(), { op: "remove", id: "ec2" })
        expect(errors).toEqual([])
        expect(findNode(tree, "ec2")).toBeNull()
    })

    it("removes a container together with its descendants", () => {
        const { tree } = apply(base(), { op: "remove", id: "vpc" })
        expect(findNode(tree, "vpc")).toBeNull()
        expect(findNode(tree, "alb")).toBeNull()
        expect(findNode(tree, "ec2")).toBeNull()
    })

    it("removes edges that touched the deleted subtree", () => {
        // Leaving them would render as an arrow pointing at nothing.
        const { tree } = apply(base(), { op: "remove", id: "ec2" })
        expect(tree.links).toEqual([])
    })

    it("removes edges anchored deep inside a removed container", () => {
        const t = base()
        t.links.push({ source: "alb", target: "alb" })
        const { tree } = apply(t, { op: "remove", id: "vpc" })
        expect(tree.links).toEqual([])
    })

    it("reports a removal of something that is not there", () => {
        const { errors } = apply(base(), { op: "remove", id: "ghost" })
        expect(errors[0]).toContain("ghost")
    })
})

describe("move", () => {
    it("moves a node between containers", () => {
        const t = base()
        ;(t.roots[0] as GroupNode).children.push({
            kind: "group",
            id: "other",
            gname: null,
            label: "Other",
            dir: "col",
            gap: 20,
            children: [],
        })
        const { tree, errors } = apply(t, {
            op: "move",
            id: "ec2",
            parent: "other",
        })
        expect(errors).toEqual([])
        expect(findParent(tree, "ec2")?.id).toBe("other")
    })

    it("moves a node to the top level", () => {
        const { tree } = apply(base(), { op: "move", id: "ec2" })
        expect(tree.roots.map((r) => r.id)).toContain("ec2")
        expect(findParent(tree, "ec2")).toBeNull()
    })

    it("reorders within the same container", () => {
        const { tree } = apply(base(), {
            op: "move",
            id: "alb",
            parent: "vpc",
            after: "ec2",
        })
        expect(
            (findNode(tree, "vpc") as ContainerNode).children.map((c) => c.id),
        ).toEqual(["ec2", "alb"])
    })

    it("keeps the moved node's own children with it", () => {
        const t: DiagramTree = {
            roots: [
                {
                    kind: "group",
                    id: "a",
                    gname: null,
                    label: "A",
                    dir: "col",
                    gap: 20,
                    children: [
                        {
                            kind: "group",
                            id: "sub",
                            gname: null,
                            label: "Sub",
                            dir: "col",
                            gap: 20,
                            children: [
                                {
                                    kind: "icon",
                                    id: "leaf",
                                    name: "s3",
                                    label: "",
                                },
                            ],
                        },
                    ],
                },
                {
                    kind: "group",
                    id: "b",
                    gname: null,
                    label: "B",
                    dir: "col",
                    gap: 20,
                    children: [],
                },
            ],
            links: [],
            foreign: [],
        }
        const { tree } = apply(t, { op: "move", id: "sub", parent: "b" })
        expect(findParent(tree, "sub")?.id).toBe("b")
        expect(findParent(tree, "leaf")?.id).toBe("sub")
    })

    it("refuses to move a container into itself", () => {
        const { errors } = apply(base(), {
            op: "move",
            id: "vpc",
            parent: "vpc",
        })
        expect(errors[0]).toContain("inside itself")
    })

    it("refuses to move a container into its own descendant", () => {
        const { errors, tree } = apply(base(), {
            op: "move",
            id: "vpc",
            parent: "ec2",
        })
        // ec2 is a leaf, so this is caught as "not a container" — either way the tree
        // must survive intact rather than losing the subtree into a cycle.
        expect(errors).toHaveLength(1)
        expect(findNode(tree, "vpc")).not.toBeNull()
        expect(findNode(tree, "ec2")).not.toBeNull()
    })

    it("refuses to move a container into a nested descendant container", () => {
        const t: DiagramTree = {
            roots: [
                {
                    kind: "group",
                    id: "outer",
                    gname: null,
                    label: "O",
                    dir: "col",
                    gap: 20,
                    children: [
                        {
                            kind: "group",
                            id: "inner",
                            gname: null,
                            label: "I",
                            dir: "col",
                            gap: 20,
                            children: [],
                        },
                    ],
                },
            ],
            links: [],
            foreign: [],
        }
        const { errors, tree } = apply(t, {
            op: "move",
            id: "outer",
            parent: "inner",
        })
        expect(errors[0]).toContain("inside itself")
        expect(findNode(tree, "outer")).not.toBeNull()
        expect(findParent(tree, "inner")?.id).toBe("outer")
    })

    it("reports a move of something that is not there", () => {
        const { errors } = apply(base(), { op: "move", id: "ghost" })
        expect(errors[0]).toContain("ghost")
    })
})

describe("property setters", () => {
    it("renames a node", () => {
        const { tree } = apply(base(), {
            op: "set_label",
            id: "vpc",
            label: "Production VPC",
        })
        expect((findNode(tree, "vpc") as ContainerNode).label).toBe(
            "Production VPC",
        )
    })

    it("re-orients a container", () => {
        const { tree } = apply(base(), { op: "set_dir", id: "vpc", dir: "row" })
        expect((findNode(tree, "vpc") as GroupNode).dir).toBe("row")
    })

    it("refuses set_dir on a grid, whose layout is driven by its column count", () => {
        const t = apply(base(), {
            op: "add_grid",
            id: "g",
            label: "G",
            cols: 2,
        }).tree
        const { errors } = apply(t, { op: "set_dir", id: "g", dir: "row" })
        expect(errors[0]).toContain("grid")
    })

    it("refuses set_dir on a leaf", () => {
        const { errors } = apply(base(), {
            op: "set_dir",
            id: "ec2",
            dir: "row",
        })
        expect(errors[0]).toContain("not a container")
    })

    it("changes a gap and refuses a negative one", () => {
        expect(
            (
                apply(base(), { op: "set_gap", id: "vpc", gap: 40 }).tree
                    .roots[0] as GroupNode
            ).gap,
        ).toBe(40)
        expect(
            (
                apply(base(), { op: "set_gap", id: "vpc", gap: -10 }).tree
                    .roots[0] as GroupNode
            ).gap,
        ).toBe(0)
    })

    it("sets the page title", () => {
        const { tree } = apply(base(), { op: "set_title", title: "My Diagram" })
        expect(tree.title).toBe("My Diagram")
    })
})

describe("links", () => {
    it("adds an edge", () => {
        const { tree, errors } = apply(base(), {
            op: "link",
            source: "ec2",
            target: "alb",
            label: "response",
        })
        expect(errors).toEqual([])
        expect(tree.links).toHaveLength(2)
        expect(tree.links[1].label).toBe("response")
    })

    it("carries dashed and step through", () => {
        const { tree } = apply(base(), {
            op: "link",
            source: "ec2",
            target: "alb",
            dashed: true,
            step: 3,
        })
        const l = tree.links[1]
        expect(l.dashed).toBe(true)
        expect(l.step).toBe(3)
    })

    it("refuses an edge to a node that does not exist", () => {
        const { errors } = apply(base(), {
            op: "link",
            source: "ec2",
            target: "ghost",
        })
        expect(errors[0]).toContain("ghost")
    })

    it("refuses a duplicate edge instead of drawing two arrows on top of each other", () => {
        const { errors } = apply(base(), {
            op: "link",
            source: "alb",
            target: "ec2",
        })
        expect(errors[0]).toContain("already exists")
    })

    it("removes an edge", () => {
        const { tree, errors } = apply(base(), {
            op: "unlink",
            source: "alb",
            target: "ec2",
        })
        expect(errors).toEqual([])
        expect(tree.links).toEqual([])
    })

    it("reports unlinking an edge that is not there", () => {
        const { errors } = apply(base(), {
            op: "unlink",
            source: "ec2",
            target: "alb",
        })
        expect(errors[0]).toContain("no edge")
    })
})

describe("batch semantics", () => {
    it("does not mutate the input tree", () => {
        const original = base()
        const snapshot = JSON.stringify(original)
        apply(original, { op: "remove", id: "ec2" })
        expect(JSON.stringify(original)).toBe(snapshot)
    })

    it("applies later ops against the result of earlier ones", () => {
        const { tree, errors } = apply(
            base(),
            {
                op: "add_container",
                id: "az",
                parent: "vpc",
                label: "AZ",
                dir: "col",
            },
            { op: "add_icon", id: "nat", parent: "az", name: "nat_gateway" },
            { op: "link", source: "nat", target: "ec2" },
        )
        expect(errors).toEqual([])
        expect(findParent(tree, "nat")?.id).toBe("az")
        expect(tree.links).toHaveLength(2)
    })

    it("keeps going after a failed op and reports each failure", () => {
        const { tree, errors } = apply(
            base(),
            { op: "remove", id: "ghost" },
            { op: "add_icon", id: "s3", parent: "vpc", name: "s3" },
            { op: "set_dir", id: "ec2", dir: "row" },
        )
        expect(errors).toHaveLength(2)
        // the valid op in the middle still took effect
        expect(findNode(tree, "s3")).not.toBeNull()
    })

    it("builds a whole diagram from an empty canvas", () => {
        const { tree, errors } = apply(
            empty(),
            { op: "set_title", title: "Three Tier" },
            { op: "add_box", id: "users", label: "Users" },
            {
                op: "add_container",
                id: "region",
                label: "Region",
                dir: "row",
                gname: "group_region",
            },
            {
                op: "add_container",
                id: "vpc",
                parent: "region",
                label: "VPC",
                dir: "col",
                gname: "group_vpc",
            },
            {
                op: "add_icon",
                id: "alb",
                parent: "vpc",
                name: "application_load_balancer",
                label: "ALB",
            },
            {
                op: "add_icon",
                id: "ec2",
                parent: "vpc",
                name: "ec2",
                label: "EC2",
            },
            { op: "link", source: "users", target: "alb", step: 1 },
            { op: "link", source: "alb", target: "ec2", step: 2 },
        )
        expect(errors).toEqual([])
        expect(tree.title).toBe("Three Tier")
        expect(tree.roots.map((r) => r.id)).toEqual(["users", "region"])
        expect(findParent(tree, "vpc")?.id).toBe("region")
        expect(tree.links).toHaveLength(2)
    })
})

describe("OperationSchema", () => {
    it("accepts a well-formed operation", () => {
        expect(
            OperationSchema.safeParse({
                op: "add_icon",
                id: "a",
                name: "s3",
            }).success,
        ).toBe(true)
    })

    it("rejects an unknown op name", () => {
        expect(
            OperationSchema.safeParse({ op: "teleport", id: "a" }).success,
        ).toBe(false)
    })

    it("rejects a missing required field", () => {
        expect(
            OperationSchema.safeParse({ op: "add_icon", id: "a" }).success,
        ).toBe(false)
    })

    it("rejects a direction outside the union", () => {
        expect(
            OperationSchema.safeParse({
                op: "set_dir",
                id: "a",
                dir: "diagonal",
            }).success,
        ).toBe(false)
    })
})

describe("collectNames", () => {
    it("returns every icon and group name for catalog checking", () => {
        const names = collectNames(base())
        expect(names).toEqual(
            expect.arrayContaining([
                { id: "vpc", name: "group_vpc", kind: "group" },
                { id: "alb", name: "application_load_balancer", kind: "icon" },
                { id: "ec2", name: "ec2", kind: "icon" },
            ]),
        )
    })

    it("skips a plain frame, which has no stencil to check", () => {
        const t = apply(base(), {
            op: "add_container",
            id: "plain",
            label: "Plain",
            dir: "row",
        }).tree
        expect(collectNames(t).map((n) => n.id)).not.toContain("plain")
    })

    it("skips a box", () => {
        const t = apply(base(), { op: "add_box", id: "b", label: "B" }).tree
        expect(collectNames(t).map((n) => n.id)).not.toContain("b")
    })
})

describe("outline", () => {
    it("shows nesting, kinds and links compactly", () => {
        const text = outline(base())
        expect(text).toContain("vpc: col")
        expect(text).toContain("alb: icon application_load_balancer")
        expect(text).toContain("link alb -> ec2")
    })

    it("includes the title", () => {
        const t = apply(base(), { op: "set_title", title: "T" }).tree
        expect(outline(t)).toContain("title: T")
    })

    it("marks an unlabelled container as a wrapper so its purpose is clear", () => {
        const t = apply(base(), {
            op: "add_container",
            id: "w",
            label: "",
            dir: "row",
        }).tree
        expect(outline(t)).toContain("w: row (wrapper)")
    })

    it("notes cells kept verbatim, so the model knows they exist but are not its to edit", () => {
        const t = base()
        t.foreign.push({ id: "note", xml: '<mxCell id="note"/>', parent: "1" })
        expect(outline(t)).toContain("1 cell(s) kept as-is: note")
    })

    it("is far more compact than the JSON tree", () => {
        const t = base()
        expect(outline(t).length).toBeLessThan(JSON.stringify(t).length / 2)
    })

    it("shows every node exactly once", () => {
        const t = base()
        const text = outline(t)
        for (const n of walkTree(t)) {
            const hits = text.split("\n").filter((l) => l.includes(`${n.id}:`))
            expect(hits).toHaveLength(1)
        }
    })
})
