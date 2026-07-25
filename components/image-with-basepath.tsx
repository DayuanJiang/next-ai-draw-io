import NextImage, { type ImageProps } from "next/image"
import { forwardRef } from "react"
import { getAssetUrl } from "@/lib/base-path"

export default forwardRef<HTMLImageElement, ImageProps>(
    function Image(props, ref) {
        const src =
            typeof props.src === "string" &&
            props.src.startsWith("/") &&
            !props.src.startsWith("//")
                ? getAssetUrl(props.src)
                : props.src

        return <NextImage {...props} src={src} ref={ref} />
    },
)
