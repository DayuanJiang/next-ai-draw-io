import {
    imageTypeOf,
    MAX_FILES,
    MAX_FILE_SIZE as MAX_IMAGE_SIZE,
} from "@/lib/chat-helpers"
import { formatMessage } from "@/lib/i18n/utils"
import { isPdfFile, isTextFile } from "@/lib/pdf-utils"

// Image formats every supported model provider accepts (SVG is read as text)
const SUPPORTED_IMAGE_TYPES = [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
]

/** Accept list for the attachment picker (.drawio files open as the diagram) */
export const ATTACHMENT_ACCEPT =
    "image/png,image/jpeg,image/gif,image/webp,.svg,.pdf,application/pdf,text/*,.md,.markdown,.json,.csv,.xml,.yaml,.yml,.toml,.drawio"

/** A draw.io file (.drawio or .drawio.svg), opened rather than attached */
export function isDiagramFile(file: File): boolean {
    return /\.drawio(\.svg)?$/i.test(file.name)
}

function isValidFileType(file: File): boolean {
    return (
        SUPPORTED_IMAGE_TYPES.includes(file.type) ||
        isPdfFile(file) ||
        isTextFile(file)
    )
}

// Longest side of a picture after it is scaled down; the models scale
// larger pictures down themselves
const MAX_IMAGE_SIDE = 2000

/** A picture over the size limit, which shrinkImage can scale down */
export function isOversizedImage(file: File): boolean {
    return (
        SUPPORTED_IMAGE_TYPES.includes(file.type) && file.size > MAX_IMAGE_SIZE
    )
}

/**
 * The picture as a JPEG of at most 2000 pixels a side: a phone photo or a
 * large screenshot is over the size limit as it is. A file the browser
 * cannot read as a picture is returned unchanged.
 */
export async function shrinkImage(file: File): Promise<File> {
    try {
        const bitmap = await createImageBitmap(file)
        const scale = Math.min(
            1,
            MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height),
        )
        const canvas = document.createElement("canvas")
        canvas.width = Math.round(bitmap.width * scale)
        canvas.height = Math.round(bitmap.height * scale)
        const context = canvas.getContext("2d")
        if (!context) return file
        // JPEG has no transparency: see-through parts are painted white,
        // which a bare canvas would turn black
        context.fillStyle = "white"
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        bitmap.close()
        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", 0.85),
        )
        if (!blob) return file
        return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, {
            type: "image/jpeg",
        })
    } catch {
        return file
    }
}

/**
 * The image format each picture's content is in, read from its first bytes
 * (undefined: none the models read). The type the browser reports only
 * repeats the file's name.
 */
export async function readImageTypes(
    files: File[],
): Promise<Map<File, string | undefined>> {
    const types = new Map<File, string | undefined>()
    for (const file of files) {
        if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) continue
        const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
        types.set(file, imageTypeOf(String.fromCharCode(...head)))
    }
    return types
}

function formatFileSize(bytes: number): string {
    const mb = bytes / 1024 / 1024
    if (mb < 0.01) return `${(bytes / 1024).toFixed(0)}KB`
    return `${mb.toFixed(2)}MB`
}

/**
 * Keep the files that can be attached; describe the rest as errors.
 * imageTypes is what readImageTypes found in the pictures.
 */
export function validateFiles(
    newFiles: File[],
    existingCount: number,
    dict: any,
    imageTypes: Map<File, string | undefined>,
): { validFiles: File[]; errors: string[] } {
    const errors: string[] = []
    const validFiles: File[] = []
    const availableSlots = MAX_FILES - existingCount

    if (availableSlots <= 0) {
        errors.push(formatMessage(dict.errors.maxFiles, { max: MAX_FILES }))
        return { validFiles, errors }
    }

    for (const [index, file] of newFiles.entries()) {
        if (validFiles.length >= availableSlots) {
            errors.push(
                formatMessage(dict.errors.onlyMoreAllowed, {
                    slots: availableSlots,
                    // The files left out, so the user knows which they are
                    names: newFiles
                        .slice(index)
                        .map((f) => f.name)
                        .join(", "),
                }),
            )
            break
        }
        if (!isValidFileType(file)) {
            errors.push(
                formatMessage(dict.errors.unsupportedType, { name: file.name }),
            )
            continue
        }
        // An empty file (some pasted images are) holds nothing for the
        // model, and an empty image fails the whole request
        if (file.size === 0) {
            errors.push(
                formatMessage(dict.errors.fileEmpty, { name: file.name }),
            )
            continue
        }
        // A file named as a picture that is none the models read (a HEIC
        // photo or an Office file named .jpg) fails the whole request at
        // the provider, whose error does not say which file is wrong
        const imageType = imageTypes.get(file)
        if (imageTypes.has(file) && !imageType) {
            errors.push(
                formatMessage(dict.errors.notAnImage, { name: file.name }),
            )
            continue
        }
        // PDFs and text files are extracted in the browser, so only images
        // have a size limit
        const isExtractedFile = isPdfFile(file) || isTextFile(file)
        if (!isExtractedFile && file.size > MAX_IMAGE_SIZE) {
            errors.push(
                formatMessage(dict.errors.fileExceeds, {
                    name: file.name,
                    size: formatFileSize(file.size),
                    max: MAX_IMAGE_SIZE / 1024 / 1024,
                }),
            )
        } else if (imageType && imageType !== file.type) {
            // A picture in another format than its name says (a PNG saved
            // as .jpg) goes out as what it is: Claude refuses a picture
            // sent as another format. The date stays, by which a file
            // picked twice is known.
            validFiles.push(
                new File([file], file.name, {
                    type: imageType,
                    lastModified: file.lastModified,
                }),
            )
        } else {
            validFiles.push(file)
        }
    }
    return { validFiles, errors }
}
