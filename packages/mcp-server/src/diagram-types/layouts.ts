/**
 * The layouts of the diagram types that have one. A layout runs on a new
 * diagram whose type the model named (the `type` of the drawing tool): it
 * moves shapes and gives lines their paths, and says what it did.
 */
import { layoutSequence } from "./sequence-layout.ts"
import { layoutSwimlane } from "./swimlane-layout.ts"
import { layoutUsecase } from "./usecase-layout.ts"

const LAYOUTS: Record<string, (root: Element) => string[]> = {
    sequence: layoutSequence,
    swimlane: layoutSwimlane,
    "swimlane-horizontal": layoutSwimlane,
    usecase: layoutUsecase,
}

export function layoutOfType(
    type: string | undefined,
): ((root: Element) => string[]) | undefined {
    return type ? LAYOUTS[type.trim().toLowerCase()] : undefined
}
