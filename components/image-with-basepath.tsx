import NextImage from "next/image"
import type * as React from "react"
import type * as React from "react"
import { getAssetUrl } from "@/lib/base-path"

export default function Image(props: React.ComponentProps<typeof NextImage>) {
    const src =
        typeof props.src === "string" &&
        props.src.startsWith("/") &&
        !props.src.startsWith("//")
            ? getAssetUrl(props.src)
            : props.src

    return <NextImage {...props} src={src} />
}
