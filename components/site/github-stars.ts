import { GITHUB_URL } from "./site-texts"

/**
 * The repository's star count, fetched at most once a day. null when GitHub
 * cannot be reached (offline builds), and the header then shows no number.
 */
export async function githubStars(): Promise<number | null> {
    const api = GITHUB_URL.replace("github.com", "api.github.com/repos")
    try {
        const response = await fetch(api, {
            next: { revalidate: 86400 },
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
