/**
 * Shape and icon library docs (docs/shape-libraries/*.md), the same files
 * the web app's get_shape_library tool reads (app/api/chat/route.ts).
 */

import { readFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const SHAPE_LIBRARY_GROUPS: Record<string, string[]> = {
    Cloud: [
        "aws4",
        "azure2",
        "gcp2",
        "alibaba_cloud",
        "openstack",
        "salesforce",
    ],
    Networking: ["cisco19", "network", "kubernetes", "vvd", "rack"],
    Business: ["bpmn", "lean_mapping"],
    General: ["flowchart", "basic", "arrows2", "infographic", "sitemap"],
    "UI/Mockups": ["android", "material_design"],
    Enterprise: ["citrix", "sap", "mscae", "atlassian"],
    Engineering: ["fluidpower", "electrical", "pid", "cabinets", "floorplan"],
    Icons: ["webicons"],
}

const LIBRARIES = new Set(Object.values(SHAPE_LIBRARY_GROUPS).flat())

const here = dirname(fileURLToPath(import.meta.url))
// The build copies the docs to dist/shape-libraries; running from src (tsx)
// reads them from the repository instead.
const LIBRARY_DIRS = [
    join(here, "shape-libraries"),
    resolve(here, "../../../docs/shape-libraries"),
]

export async function getShapeLibrary(
    name: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
    const library = name.trim().toLowerCase()
    if (!LIBRARIES.has(library)) {
        return {
            ok: false,
            error: `Library "${name}" not found. Available: ${Array.from(LIBRARIES).join(", ")}`,
        }
    }
    for (const dir of LIBRARY_DIRS) {
        try {
            return {
                ok: true,
                text: await readFile(join(dir, `${library}.md`), "utf-8"),
            }
        } catch {
            // Try the next location
        }
    }
    return {
        ok: false,
        error: `Library "${library}" is missing from this installation.`,
    }
}
