import NextImage from "next/image"
import type * as React from "react"
import { getAssetUrl } from "../lib/base-path"

export default function Image(props: React.ComponentProps<typeof NextImage>) {
    const src =
        typeof props.src === "string" && !props.src.startsWith("http")
            ? getAssetUrl(props.src)
            : props.src

    return <NextImage {...props} src={src} />
}
