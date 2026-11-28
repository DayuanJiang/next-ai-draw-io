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

// The file each scaled down picture was made from
const pickedFiles = new WeakMap<File, File>()

/**
 * The file as the user picked it: a scaled down picture has another name,
 * size and date, by which a file picked twice could not be known
 */
export const pickedFile = (file: File) => pickedFiles.get(file) ?? file

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
        const shrunk = new File(
            [blob],
            `${file.name.replace(/\.[^.]+$/, "")}.jpg`,
            { type: "image/jpeg" },
        )
        pickedFiles.set(shrunk, file)
        return shrunk
    } catch {
        return file
    }
}

// What the pictures of one message may come to for an OpenAI model on Amazon
// Bedrock (GPT-6 Luna there). Since 2026-11-25 Bedrock answers "The provided
// request is not valid" when the pictures of a request hold too much data.
// It does not count the files' sizes (a 350 KB photo of 1550 x 1160 fails)
// but about what the decoded pictures come to as PNGs written fast, with a
// limit near 2.5 MB. Of some 250 requests with real photos and screenshots,
// measured with pngSizeEstimate, the smallest that failed came to 2.0 MB.
const BEDROCK_OPENAI_IMAGE_BYTES = 1_700_000

/**
 * How many bytes the pictures of one message may come to (by
 * pngSizeEstimate) for this model; undefined when no such limit is known
 */
export function imageBudgetOf(modelId: string | undefined): number | undefined {
    // Bedrock's ids: openai.gpt-6-luna, global.openai.gpt-6-luna
    return /(^|\.)openai\./.test(modelId ?? "")
        ? BEDROCK_OPENAI_IMAGE_BYTES
        : undefined
}

/**
 * About the bytes a picture (canvas pixels, four bytes each) comes to as a
 * PNG written fast: every byte less the one above it, a run of equal bytes
 * for next to nothing, the other bytes by how rare their value is
 */
export function pngSizeEstimate(
    rgba: Uint8ClampedArray,
    width: number,
): number {
    const row = width * 4
    // How often each value stands alone, and the runs in pieces of 258
    const counts = new Float64Array(256)
    let runs = 0
    let last = -1
    let length = 0
    const endRun = () => {
        if (length >= 4) {
            counts[last]++
            runs += Math.ceil((length - 1) / 258)
        } else if (length > 0) {
            counts[last] += length
        }
    }
    for (let i = 0; i < rgba.length; i++) {
        // Not the transparency
        if ((i & 3) === 3) continue
        const value = (rgba[i] - (i >= row ? rgba[i - row] : 0)) & 255
        if (value === last) {
            length++
        } else {
            endRun()
            last = value
            length = 1
        }
    }
    endRun()
    const alone = counts.reduce((sum, n) => sum + n, 0)
    let bits = runs * 14
    for (const n of counts) if (n > 0) bits -= n * Math.log2(n / alone)
    return bits / 8
}

// The picture drawn at a scale, with what it comes to
function drawn(bitmap: ImageBitmap, scale: number) {
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("no canvas")
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    return { canvas, size: pngSizeEstimate(data, canvas.width) }
}

const pngOf = (canvas: HTMLCanvasElement) =>
    new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error("no PNG"))),
            "image/png",
        ),
    )

/**
 * The size no picture may be over for all of them to fit the budget together:
 * the small ones keep their size, the large ones share what is left
 */
export function shareOf(sizes: number[], budget: number): number {
    const sorted = [...sizes].sort((a, b) => a - b)
    let left = budget
    for (const [i, size] of sorted.entries()) {
        const share = left / (sorted.length - i)
        if (size > share) return share
        left -= size
    }
    return Number.POSITIVE_INFINITY
}

/**
 * The files with their largest pictures scaled down until all the pictures
 * come to no more than budget bytes (by pngSizeEstimate): a small diagram
 * next to a photo stays as it is. A scaled down picture becomes a PNG.
 * Pictures that fit are returned as they are, and so is everything when a
 * picture cannot be read here: the provider then says what is wrong with it.
 */
export async function fitImages(
    files: File[],
    budget: number,
): Promise<File[]> {
    const pictures = files.filter((f) => SUPPORTED_IMAGE_TYPES.includes(f.type))
    if (pictures.length === 0) return files
    const bitmaps: ImageBitmap[] = []
    try {
        for (const file of pictures) bitmaps.push(await createImageBitmap(file))
        const scales = bitmaps.map(() => 1)
        const drawings = bitmaps.map((bitmap) => drawn(bitmap, 1))
        const total = () => drawings.reduce((sum, d) => sum + d.size, 0)
        // The size follows the number of pixels closely: the first round
        // fits as a rule
        for (let round = 0; round < 6 && total() > budget; round++) {
            const share = shareOf(
                drawings.map((d) => d.size),
                budget,
            )
            for (const [i, { size }] of drawings.entries()) {
                if (size <= share) continue
                scales[i] *= Math.sqrt(share / size) * 0.95
                drawings[i] = drawn(bitmaps[i], scales[i])
            }
        }
        const sent: File[] = []
        for (const file of files) {
            const i = pictures.indexOf(file)
            if (i < 0 || scales[i] === 1) {
                sent.push(file)
                continue
            }
            let png = await pngOf(drawings[i].canvas)
            // The server takes no file over the size limit
            while (png.size > MAX_IMAGE_SIZE) {
                scales[i] *= 0.9
                drawings[i] = drawn(bitmaps[i], scales[i])
                png = await pngOf(drawings[i].canvas)
            }
            sent.push(
                new File([png], `${file.name.replace(/\.[^.]+$/, "")}.png`, {
                    type: "image/png",
                }),
            )
        }
        return sent
    } catch {
        return files
    } finally {
        for (const bitmap of bitmaps) bitmap.close()
    }
}

// What fitImageParts made of a message's parts: a turn asks the model
// several times, with the same message each time
const fittedParts = new WeakMap<any[], { budget: number; parts: any[] }>()

/**
 * A message's parts with its pictures fitted to the budget (fitImages).
 * Done on the request: a message sent again with another model
 * (regenerate, edit, retry) is fitted to that model.
 */
export async function fitImageParts(
    parts: any[],
    budget: number,
): Promise<any[]> {
    const known = fittedParts.get(parts)
    if (known?.budget === budget) return known.parts
    const pictures = parts.filter(
        (part) =>
            part.type === "file" &&
            SUPPORTED_IMAGE_TYPES.includes(part.mediaType) &&
            String(part.url).startsWith("data:"),
    )
    const files = pictures.map((part, i) => {
        const bytes = Uint8Array.from(atob(part.url.split(",")[1]), (c) =>
            c.charCodeAt(0),
        )
        return new File([bytes], `picture-${i}`, { type: part.mediaType })
    })
    const fitted = await fitImages(files, budget)
    const urls = await Promise.all(
        fitted.map((file, i) =>
            file === files[i]
                ? pictures[i].url
                : new Promise<string>((resolve, reject) => {
                      const reader = new FileReader()
                      reader.onload = () => resolve(reader.result as string)
                      reader.onerror = () => reject(reader.error)
                      reader.readAsDataURL(file)
                  }),
        ),
    )
    const result = parts.map((part) => {
        const i = pictures.indexOf(part)
        return i < 0 || fitted[i] === files[i]
            ? part
            : { ...part, url: urls[i], mediaType: fitted[i].type }
    })
    fittedParts.set(parts, { budget, parts: result })
    return result
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
