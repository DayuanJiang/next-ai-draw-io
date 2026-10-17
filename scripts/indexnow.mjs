// Tells IndexNow (Bing, Yandex, Seznam, Naver and others) which site pages a
// deploy changed, so they recrawl those pages instead of waiting.
//
//   node scripts/indexnow.mjs snapshot <file>   before the deploy
//   node scripts/indexnow.mjs submit <file>     after it: submits the pages
//                                               that changed or are new
//
// A page counts as changed when its text or its head tags (title,
// description, canonical, hreflang) differ. Scripts and asset names change on
// every build, and the header's GitHub star count changes on its own, so
// they are left out.
import { createHash } from "node:crypto"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"

const SITE = "https://next-ai-drawio.jiang.jp"
// Cloudflare turns away requests without a browser-like user agent
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; next-ai-drawio-indexnow/1.0)",
}
// The key is the name of the 32-character .txt file in public/
const KEY = readdirSync("public")
    .find((f) => /^[0-9a-f]{32}\.txt$/.test(f))
    ?.slice(0, -4)

async function get(url) {
    const response = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) throw new Error(`${url} answered ${response.status}`)
    return response.text()
}

async function fingerprints() {
    const sitemap = await get(`${SITE}/sitemap.xml`)
    const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    const result = {}
    for (const url of urls) {
        const html = (await get(url))
            .replace(/<script[\s\S]*?<\/script>/g, "")
            .replace(/<a [^>]*aria-label="GitHub"[^>]*>[\s\S]*?<\/a>/g, "")
        const head = (
            html.match(
                /<(title|meta|link rel="(canonical|alternate)")[^>]*>/g,
            ) ?? []
        ).join("\n")
        const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
        result[url] = createHash("sha256")
            .update(`${head}\n${text}`)
            .digest("hex")
    }
    return result
}

const [command, file] = process.argv.slice(2)
if (command === "snapshot") {
    const pages = await fingerprints()
    writeFileSync(file, JSON.stringify(pages, null, 1))
    console.log(`Saved ${Object.keys(pages).length} pages`)
} else if (command === "submit") {
    const before = JSON.parse(readFileSync(file, "utf8"))
    const after = await fingerprints()
    const changed = Object.keys(after).filter(
        (url) => before[url] !== after[url],
    )
    if (changed.length === 0) {
        console.log("No page changed")
    } else {
        const host = new URL(SITE).host
        const response = await fetch("https://api.indexnow.org/indexnow", {
            method: "POST",
            headers: {
                ...HEADERS,
                "Content-Type": "application/json; charset=utf-8",
            },
            body: JSON.stringify({
                host,
                key: KEY,
                keyLocation: `${SITE}/${KEY}.txt`,
                urlList: changed,
            }),
        })
        console.log(`Submitted ${changed.length} pages: ${response.status}`)
        for (const url of changed) console.log(`  ${url}`)
        if (!response.ok) process.exit(1)
    }
} else {
    console.error("Usage: node scripts/indexnow.mjs snapshot|submit <file>")
    process.exit(2)
}
