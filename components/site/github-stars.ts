import { GITHUB_URL } from "./site-texts"

/**
 * The repository's star count, fetched when the site is built, so the site
 * pages stay static. null when GitHub cannot be reached (offline builds), and
 * the header then shows no number.
 */
export async function githubStars(): Promise<number | null> {
    const api = GITHUB_URL.replace("github.com", "api.github.com/repos")
    try {
        // A daily revalidate made every site page send
        // stale-while-revalidate, and browsers then refetched each prefetch
        const response = await fetch(api, {
            signal: AbortSignal.timeout(3000),
        })
        if (!response.ok) return null
        const { stargazers_count } = (await response.json()) as {
            stargazers_count?: number
        }
        return stargazers_count ?? null
    } catch {
        return null
    }
}
