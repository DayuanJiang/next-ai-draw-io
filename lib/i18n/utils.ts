export function formatMessage(
    template: string | undefined,
    vars?: Record<string, string | number | undefined>,
): string {
    if (!template) return ""
    if (!vars) return template

    return template.replace(/\{(\w+)\}/g, (match, name) => {
        const val = vars[name]
        return val === undefined ? match : String(val)
    })
}

export default formatMessage
