import { Cloud, Server, Sparkles } from "lucide-react"
import { PROVIDERS, type ProviderName } from "@/lib/providers"
import { cn } from "@/lib/utils"

const ICONS = { cloud: Cloud, server: Server, sparkles: Sparkles }

// Provider logo from models.dev, or the record's Lucide icon for providers
// that have no logo there
export function ProviderLogo({
    provider,
    className,
}: {
    provider: ProviderName
    className?: string
}) {
    const { icon, logo } = PROVIDERS[provider]
    if (icon) {
        const Icon = ICONS[icon]
        return <Icon className={cn("size-4", className)} />
    }
    return (
        // biome-ignore lint/performance/noImgElement: External URL from models.dev
        <img
            alt=""
            aria-hidden="true"
            className={cn("size-4 dark:invert", className)}
            height={16}
            src={`https://models.dev/logos/${logo ?? provider}.svg`}
            width={16}
        />
    )
}
