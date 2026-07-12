/**
 * Workflow gate for edit_diagram.
 *
 * Instead of a wall-clock timeout (the old 30s rule rejected slow-but-correct
 * clients, see #885), we compare content: `lastSeenXml` is the exact
 * state-store XML the model last saw (get_diagram) or wrote itself
 * (create_new_diagram / edit_diagram / page CRUD). The store only changes on
 * server writes or browser pushes (user autosave, sync exports), so if the
 * live store still equals `lastSeenXml`, nothing happened that the model
 * hasn't seen — the edit is safe no matter how much time passed.
 */
export type EditGateResult =
    | { ok: true }
    | { ok: false; reason: "no-context" | "stale" }

export function checkEditGate(
    lastSeenXml: string,
    liveXml: string,
): EditGateResult {
    // Model never fetched or produced any diagram state in this session.
    if (!lastSeenXml) return { ok: false, reason: "no-context" }
    // Browser state moved since the model last looked (e.g. manual user
    // edits): force a re-fetch so update/delete operations don't build on
    // stale cell contents. An empty liveXml means the store has no entry to
    // compare against, so there is nothing newer to have missed.
    if (liveXml && liveXml !== lastSeenXml)
        return { ok: false, reason: "stale" }
    return { ok: true }
}
