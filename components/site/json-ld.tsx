/** Structured data for search engines, as a JSON-LD script */
export function JsonLd({ data }: { data: object }) {
    return (
        <script
            type="application/ld+json"
            // "<" escaped, so no text in the data can close the script
            dangerouslySetInnerHTML={{
                __html: JSON.stringify(data).replace(/</g, "\\u003c"),
            }}
        />
    )
}
