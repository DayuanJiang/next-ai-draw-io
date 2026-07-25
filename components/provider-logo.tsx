import { Cloud, Server, Sparkles } from "lucide-react"
import { PROVIDER_LOGO_MAP, type ProviderName } from "@/lib/types/model-config"
import { cn } from "@/lib/utils"

// Provider logo from models.dev, with Lucide fallbacks for providers
// that have no logo there
export function ProviderLogo({
    provider,
    className,
}: {
    provider: ProviderName
    className?: string
}) {
    if (provider === "bedrock") {
        return <Cloud className={cn("size-4", className)} />
    }
    if (provider === "sglang") {
        return <Server className={cn("size-4", className)} />
    }
    if (provider === "doubao") {
        return <Sparkles className={cn("size-4", className)} />
    }

    const logoName = PROVIDER_LOGO_MAP[provider] || provider
    return (
        // biome-ignore lint/performance/noImgElement: External URL from models.dev
        <img
            alt=""
            aria-hidden="true"
            className={cn("size-4 dark:invert", className)}
            height={16}
            src={`https://models.dev/logos/${logoName}.svg`}
            width={16}
        />
    )
}
