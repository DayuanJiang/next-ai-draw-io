// ============================================================================
// Structurizr DSL Export Utilities
// ============================================================================
// Converts draw.io diagrams to Structurizr DSL format for C4 model diagrams

/**
 * Parsed mxCell from draw.io XML
 */
interface MxCell {
    id: string
    value: string
    style: string
    vertex: boolean
    edge: boolean
    source?: string
    target?: string
    parent?: string
}

/**
 * C4 element types
 */
type ElementType =
    | "person"
    | "system"
    | "container"
    | "database"
    | "relationship"
    | "unknown"

/**
 * Structurizr model element
 */
interface Element {
    id: string
    name: string
    description: string
    type: ElementType
    technology?: string
}

/**
 * Structurizr relationship
 */
interface Relationship {
    source: string
    target: string
    description: string
}

/**
 * Parse draw.io XML and extract mxCell elements
 * @param xml - The draw.io XML string
 * @returns Array of parsed mxCell objects
 */
function parseDrawioXml(xml: string): MxCell[] {
    if (!xml || xml.trim() === "") {
        return []
    }

    try {
        const parser = new DOMParser()
        const doc = parser.parseFromString(xml, "text/xml")

        // Check for parse errors
        const parseError = doc.querySelector("parsererror")
        if (parseError) {
            console.error("XML parse error:", parseError.textContent)
            return []
        }

        const cells = doc.querySelectorAll("mxCell")
        return Array.from(cells).map((cell) => ({
            id: cell.getAttribute("id") || "",
            value: decodeValue(cell.getAttribute("value") || ""),
            style: cell.getAttribute("style") || "",
            vertex: cell.getAttribute("vertex") === "1",
            edge: cell.getAttribute("edge") === "1",
            source: cell.getAttribute("source") || undefined,
            target: cell.getAttribute("target") || undefined,
            parent: cell.getAttribute("parent") || undefined,
        }))
    } catch (error) {
        console.error("Failed to parse draw.io XML:", error)
        return []
    }
}

/**
 * Decode HTML entities in mxCell values
 * @param value - The encoded value
 * @returns Decoded value
 */
function decodeValue(value: string): string {
    const textarea = document.createElement("textarea")
    textarea.innerHTML = value
    return textarea.value
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, "")
        .trim()
}

/**
 * Classify a cell based on its style and properties
 * @param cell - The mxCell to classify
 * @returns Element type
 */
function classifyElement(cell: MxCell): ElementType {
    if (cell.edge) {
        return "relationship"
    }

    if (!cell.vertex) {
        return "unknown"
    }

    const style = cell.style.toLowerCase()
    const value = cell.value.toLowerCase()

    // Person/Actor detection
    if (
        style.includes("shape=actor") ||
        style.includes("shape=person") ||
        style.includes("shape=umlactor") ||
        value.includes("user") ||
        value.includes("customer") ||
        value.includes("admin") ||
        value.includes("actor")
    ) {
        return "person"
    }

    // Database detection
    if (
        style.includes("shape=cylinder") ||
        style.includes("shape=datastore") ||
        style.includes("database") ||
        value.includes("database") ||
        value.includes(" db") ||
        value.endsWith("db")
    ) {
        return "database"
    }

    // System boundary detection (rounded rectangles, clouds, larger containers)
    if (
        style.includes("rounded=1") ||
        style.includes("shape=hexagon") ||
        style.includes("shape=cloud") ||
        value.includes("system") ||
        value.includes("platform") ||
        (value.includes("service") && !value.includes("micro"))
    ) {
        return "system"
    }

    // Default to container for other vertices
    return "container"
}

/**
 * Sanitize identifier for DSL (alphanumeric + underscore only)
 * @param name - The name to sanitize
 * @returns Valid DSL identifier
 */
function sanitizeId(name: string): string {
    return (
        name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^[0-9]/, "n$&")
            .replace(/^_+|_+$/g, "") || "element"
    )
}

/**
 * Convert draw.io XML to Structurizr DSL
 * @param xml - The draw.io XML string
 * @returns Structurizr DSL string
 */
export function convertToStructurizrDsl(xml: string): string {
    const cells = parseDrawioXml(xml)

    if (cells.length === 0) {
        return `workspace "Empty Diagram" "No elements found" {
    model {
        # No elements to export
    }
    views {
        systemContext {
            include *
            autolayout lr
        }
    }
}`
    }

    // Separate elements and relationships
    const elements: Element[] = []
    const relationships: Relationship[] = []
    const idMap = new Map<string, string>() // mxCell ID -> DSL ID
    const parentMap = new Map<string, string>() // Cell ID -> Parent Cell ID

    cells.forEach((cell) => {
        const type = classifyElement(cell)

        if (type === "relationship" && cell.source && cell.target) {
            relationships.push({
                source: cell.source,
                target: cell.target,
                description: cell.value || "Uses",
            })
        } else if (type !== "unknown" && cell.value) {
            const dslId = sanitizeId(cell.value)
            idMap.set(cell.id, dslId)

            // Track parent relationships for hierarchy
            if (cell.parent && cell.parent !== "0" && cell.parent !== "1") {
                parentMap.set(cell.id, cell.parent)
            }

            elements.push({
                id: dslId,
                name: cell.value,
                description: "",
                type: type,
            })
        }
    })

    // Generate DSL with hierarchy awareness
    return generateDsl(elements, relationships, idMap, parentMap, cells)
}

/**
 * Generate Structurizr DSL string from elements and relationships
 * @param elements - Array of elements
 * @param relationships - Array of relationships
 * @param idMap - Map of mxCell IDs to DSL IDs
 * @param parentMap - Map of cell IDs to parent cell IDs
 * @param cells - Original cells for hierarchy detection
 * @returns Formatted DSL string
 */
function generateDsl(
    elements: Element[],
    relationships: Relationship[],
    idMap: Map<string, string>,
    parentMap: Map<string, string>,
    cells: MxCell[],
): string {
    const lines: string[] = []

    lines.push('workspace "Diagram Export" "Generated from Next AI Draw.io" {')
    lines.push("")
    lines.push("    model {")

    // Group by type
    const people = elements.filter((e) => e.type === "person")
    const systems = elements.filter((e) => e.type === "system")
    const containers = elements.filter(
        (e) => e.type === "container" || e.type === "database",
    )

    // Build hierarchy map: parent system ID -> child containers
    const systemContainersMap = new Map<string, Element[]>()
    const cellIdToElement = new Map<string, Element>()

    cells.forEach((cell) => {
        const element = elements.find((e) => idMap.get(cell.id) === e.id)
        if (element) {
            cellIdToElement.set(cell.id, element)
        }
    })

    containers.forEach((container) => {
        const cellId = Array.from(idMap.entries()).find(
            ([, id]) => id === container.id,
        )?.[0]
        if (cellId) {
            const parentId = parentMap.get(cellId)
            if (parentId) {
                const parentElement = cellIdToElement.get(parentId)
                if (parentElement && parentElement.type === "system") {
                    if (!systemContainersMap.has(parentElement.id)) {
                        systemContainersMap.set(parentElement.id, [])
                    }
                    systemContainersMap.get(parentElement.id)!.push(container)
                }
            }
        }
    })

    // Orphan containers (no parent system)
    const orphanContainers = containers.filter((c) => {
        return !Array.from(systemContainersMap.values()).some((list) =>
            list.includes(c),
        )
    })

    // People
    if (people.length > 0) {
        lines.push("        # People")
        people.forEach((person) => {
            lines.push(`        ${person.id} = person "${person.name}"`)
        })
        lines.push("")
    }

    // Systems with their containers
    if (systems.length > 0) {
        lines.push("        # Software Systems")
        systems.forEach((system) => {
            lines.push(
                `        ${system.id} = softwareSystem "${system.name}" {`,
            )

            const systemContainers = systemContainersMap.get(system.id) || []
            systemContainers.forEach((container) => {
                const tech =
                    container.type === "database" ? "Database" : "Application"
                lines.push(
                    `            ${container.id} = container "${container.name}" "" "${tech}"`,
                )
            })

            lines.push("        }")
        })
        lines.push("")
    }

    // If we have orphan containers but no systems, create a default system
    if (systems.length === 0 && orphanContainers.length > 0) {
        // Try to infer system name from containers
        const systemName = orphanContainers.some((c) =>
            c.name.toLowerCase().includes("commerce"),
        )
            ? "E-Commerce System"
            : "System"

        lines.push("        # Software System")
        lines.push(`        system = softwareSystem "${systemName}" {`)
        orphanContainers.forEach((container) => {
            const tech =
                container.type === "database" ? "Database" : "Application"
            lines.push(
                `            ${container.id} = container "${container.name}" "" "${tech}"`,
            )
        })
        lines.push("        }")
        lines.push("")
    }

    // Relationships
    if (relationships.length > 0) {
        lines.push("        # Relationships")
        relationships.forEach((rel) => {
            const sourceId = idMap.get(rel.source)
            const targetId = idMap.get(rel.target)

            if (sourceId && targetId) {
                // Clean up description
                const desc = rel.description.trim() || "Uses"
                lines.push(`        ${sourceId} -> ${targetId} "${desc}"`)
            }
        })
        lines.push("")
    }

    lines.push("    }")
    lines.push("")
    lines.push("    views {")

    // Choose appropriate view type based on content
    if (
        systems.length > 0 &&
        (systemContainersMap.size > 0 || orphanContainers.length > 0)
    ) {
        const firstSystem = systems[0]
        lines.push(`        container ${firstSystem.id} "Containers" {`)
        lines.push("            include *")
        lines.push("            autolayout lr")
        lines.push("        }")
    } else {
        lines.push("        systemContext {")
        lines.push("            include *")
        lines.push("            autolayout lr")
        lines.push("        }")
    }

    lines.push("    }")
    lines.push("}")

    return lines.join("\n")
}
