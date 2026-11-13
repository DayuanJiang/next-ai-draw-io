/**
 * The diagram types that have a drawing guide. The web app's
 * get_diagram_guide tool and the MCP server's get_drawing_guide (topic)
 * return a guide; the model picks the type from DIAGRAM_TYPE_LIST, which
 * the system prompt and the MCP drawing guide show.
 *
 * A type gets a guide when measurements show that it is drawn better with
 * one (scripts/eval-diagram-types). ER, state and mind map diagrams are
 * drawn well without. A guide for class diagrams helped small ones and not
 * the real ones with nine or ten classes, where its one-cell classes came
 * out on top of each other, so there is none.
 */
import { sequence } from "./sequence.ts"
import { swimlane, swimlaneHorizontal } from "./swimlane.ts"
import type { DiagramType } from "./types.ts"
import { usecase } from "./usecase.ts"

export const DIAGRAM_TYPES: DiagramType[] = [
    sequence,
    swimlane,
    swimlaneHorizontal,
    usecase,
]

export const DIAGRAM_TYPE_NAMES = DIAGRAM_TYPES.map((type) => type.name)

/** The types, one "- name: what it shows" line each, for the model */
export const DIAGRAM_TYPE_LIST = DIAGRAM_TYPES.map(
    (type) => `- ${type.name}: ${type.when}`,
).join("\n")

/**
 * The guide of a type, written for the tools of the caller: `draw` draws a
 * new diagram, `edit` changes one. An unknown name gets the list of names.
 */
export function getDiagramGuide(
    name: string,
    draw: string,
    edit: string,
): { ok: true; text: string } | { ok: false; error: string } {
    const wanted = name.trim().toLowerCase()
    const type = DIAGRAM_TYPES.find((t) => t.name === wanted)
    return type
        ? { ok: true, text: type.guide(draw, edit) }
        : {
              ok: false,
              error: `No drawing guide for "${name}". Guides exist for: ${DIAGRAM_TYPE_NAMES.join(", ")}. Draw other diagrams by the general rules.`,
          }
}
