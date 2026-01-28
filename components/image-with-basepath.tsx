import NextImage from "next/image"

export default function Image(props: React.ComponentProps<typeof NextImage>) {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ""
    const src =
        typeof props.src === "string" && !props.src.startsWith("http")
            ? `${basePath}${props.src}`
            : props.src

    return <NextImage {...props} src={src} />
}
