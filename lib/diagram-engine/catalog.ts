/**
 * The stencil catalog: a name → verbatim draw.io style map.
 *
 * This is the anti-hallucination layer. The model asks for `icon("s3")`; the engine
 * looks the name up here and gets the exact style draw.io ships, including the official
 * category colour, the connection points and `aspect=fixed`. A name that is not in the
 * catalog fails at build time with a suggestion, rather than becoming an empty square in
 * the rendered diagram — which is what happens when a model writes
 * `resIcon=mxgraph.aws4.s3_bucket_thing` by hand and nothing checks it.
 *
 * The styles are verbatim from draw.io's own shape index (via drawio-ai-kit, which
 * generated them from jgraph/drawio-mcp's index, Apache-2.0). Nothing here is
 * hand-assembled, so there is no chance of a plausible-looking but wrong colour.
 */

import stencils from "./data/aws-stencils.json"

const ICONS = stencils.icons as Record<string, string>
const GROUPS = stencils.groups as Record<string, string>

export interface CatalogEntry {
    name: string
    kind: "icon" | "group"
    style: string
    /** Official colour from the style, for showing the model what it is getting. */
    color: string | null
}

function colorOf(style: string): string | null {
    return style.match(/(?:^|;)fillColor=([^;]+)/)?.[1] ?? null
}

/** Exact lookup. Returns null for an unknown name — never a guess. */
export function lookupStencil(
    name: string,
    kind?: "icon" | "group",
): CatalogEntry | null {
    if (kind !== "group" && ICONS[name])
        return {
            name,
            kind: "icon",
            style: ICONS[name],
            color: colorOf(ICONS[name]),
        }
    if (kind !== "icon" && GROUPS[name])
        return {
            name,
            kind: "group",
            style: GROUPS[name],
            color: colorOf(GROUPS[name]),
        }
    return null
}

/** The resolver the renderer takes, so the engine itself does not depend on the catalog. */
export function resolveStyle(
    name: string,
    kind: "icon" | "group",
): string | null {
    return lookupStencil(name, kind)?.style ?? null
}

/** Normalise for matching: lowercase, and non-alphanumerics collapsed to single spaces. */
function norm(s: string): string {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
}

/**
 * Shorthand people type, mapped to words that actually appear in a catalog name.
 *
 * The direction matters: the target has to exist in the catalog. AWS's own stencil names
 * are already abbreviated — EKS is `eks`, not `elastic_kubernetes_service`, and nothing
 * in the catalog contains the word "kubernetes" at all — so expanding an abbreviation
 * into its full product name finds nothing. These entries go the other way, from a
 * spoken-out name or a nickname to the token the catalog uses.
 */
const ALIASES: Record<string, string> = {
    k8s: "eks",
    kubernetes: "eks",
    kube: "eks",
    alb: "application load balancer",
    nlb: "network load balancer",
    elb: "elastic load balancing",
    asg: "auto scaling",
    apigw: "api gateway",
    cf: "cloudfront",
    cw: "cloudwatch",
    ddb: "dynamodb",
    tgw: "transit gateway",
    igw: "internet gateway",
    r53: "route 53",
    iam: "identity and access management",
    kms: "key management service",
    postgres: "rds",
    postgresql: "rds",
    mysql: "rds",
    aurora: "aurora",
    bucket: "s3",
}

/**
 * Score one entry against the query tokens. Higher is better; 0 means no match.
 *
 * The extra-words penalty is what makes "s3" return `s3` rather than
 * `backup_aws_backup_support_for_amazon_s3` — both contain the token, so without it the
 * winner comes down to iteration order. It counts only the words the query did NOT ask
 * for, so a deliberately multi-word query like "nat gateway" is not punished for being
 * specific.
 */
function score(name: string, qTokens: string[], qJoined: string): number {
    const n = norm(name)
    const words = n.split(" ")
    let s = 0
    if (n === qJoined) s += 100
    if (n.replace(/ /g, "") === qJoined.replace(/ /g, "")) s += 60
    for (const t of qTokens) {
        if (words.includes(t)) s += 25
        else if (n.includes(t)) s += 12
    }
    if (s === 0) return 0
    const extra = words.filter((w) => !qTokens.includes(w)).length
    return s - Math.min(24, extra * 4)
}

export interface SearchHit {
    name: string
    kind: "icon" | "group"
    color: string | null
}

/**
 * Find stencils by keyword.
 *
 * Returns names and colours only, not styles. The model builds with `icon("<name>")` and
 * the engine resolves the style itself, so sending the style — around 600 characters per
 * AWS entry, and 20KB+ for an Azure one with an embedded image — would be pure context
 * burn.
 */
export function searchStencils(
    query: string,
    opts: { limit?: number; kind?: "icon" | "group" } = {},
): SearchHit[] {
    const limit = opts.limit ?? 8
    const tokens = norm(query)
        .split(" ")
        .filter(Boolean)
        .map((t) => ALIASES[t] ?? t)
        .flatMap((t) => t.split(" "))
    if (tokens.length === 0) return []
    const joined = tokens.join(" ")

    const pool: [string, string, "icon" | "group"][] = []
    if (opts.kind !== "group")
        for (const [n, st] of Object.entries(ICONS)) pool.push([n, st, "icon"])
    if (opts.kind !== "icon")
        for (const [n, st] of Object.entries(GROUPS))
            pool.push([n, st, "group"])

    return pool
        .map(([name, style, kind]) => ({
            name,
            kind,
            color: colorOf(style),
            s: score(name, tokens, joined),
        }))
        .filter((r) => r.s > 0)
        .sort((a, b) => b.s - a.s || a.name.length - b.name.length)
        .slice(0, limit)
        .map(({ name, kind, color }) => ({ name, kind, color }))
}

/**
 * Suggest real names for one that does not exist.
 *
 * Plain search is not quite the right tool here. A model that writes
 * `s3_bucket_storage` most likely meant `s3`, but searching that whole phrase ranks
 * `s3_storage_lens` first — it matches more of the query. So we also search the
 * leading token on its own and put those hits first: an invented name is usually a
 * real service name with extra words stuck on the end.
 */
function suggestFor(name: string, kind: "icon" | "group"): string[] {
    const words = norm(name.replace(/_/g, " ")).split(" ").filter(Boolean)
    const out: string[] = []
    const add = (hits: SearchHit[]) => {
        for (const h of hits) if (!out.includes(h.name)) out.push(h.name)
    }
    if (words.length > 1) add(searchStencils(words[0], { limit: 2, kind }))
    add(searchStencils(words.join(" "), { limit: 3, kind }))
    return out.slice(0, 3)
}

/**
 * Validate the icon names in a tree before laying it out, so a bad name is reported as
 * a correctable error with suggestions instead of rendering as a blank square — which is
 * what an unchecked invented name becomes in draw.io.
 */
export function checkNames(
    names: { id: string; name: string; kind: "icon" | "group" }[],
): { id: string; name: string; suggestions: string[] }[] {
    const bad: { id: string; name: string; suggestions: string[] }[] = []
    for (const n of names) {
        if (!n.name || lookupStencil(n.name, n.kind)) continue
        bad.push({
            id: n.id,
            name: n.name,
            suggestions: suggestFor(n.name, n.kind),
        })
    }
    return bad
}

/** Total catalog size, for the tool description. */
export const CATALOG_SIZE = {
    icons: Object.keys(ICONS).length,
    groups: Object.keys(GROUPS).length,
}
