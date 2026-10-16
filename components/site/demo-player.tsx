"use client"

import {
    ArrowUp,
    Check,
    Loader2,
    MousePointer2,
    Pencil,
    RotateCcw,
    SquareDashedMousePointer,
    Undo2,
    X,
} from "lucide-react"
import {
    type CSSProperties,
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react"
import { flushSync } from "react-dom"
import { SERVERLESS_SVG, withOwnId } from "./serverless-diagram"

/*
 * A scripted demo of the editor on the landing page, in four steps: a prompt
 * draws the diagram, the user drags a shape by hand, selects another and
 * asks the AI to change it, then restores version 1 from its card and goes
 * back to version 2. The diagram is a real draw.io export whose cells carry
 * data-cell-id; the demo only shows, moves and restyles them. Nothing calls
 * an AI.
 */

export type DemoTexts = {
    /** The button that plays a docs demo again */
    replay: string
    /** What each of the four steps shows */
    steps: { title: string; text: string }[]
    prompts: { draw: string; cache: string }
    replies: { draw: string; cache: string }
    /** The editor's own texts, from its dictionary */
    drawing: string
    changing: string
    placeholder: string
    /** "Selected: DynamoDB" */
    selected: string
    versions: {
        created: string
        edited: string
        undo: string
        restoreV1: string
        restoreV2: string
        editedSince: string
        drawSummary: string
        cacheSummary: string
    }
}

type Version = { n: number; title: string; summary: string }
type Message =
    | { role: "user"; text: string; selected?: boolean }
    | { role: "ai"; text: string; version?: Version }
type Point = { x: number; y: number }
type Box = { left: number; top: number; width: number; height: number }

// About how long each step plays, for its progress bar
const STEP_MS = [5800, 3100, 6100, 5900]

/** A draw.io SVG export and the ids of its cells, in the order they are drawn */
export type DemoDiagram = { svg: string; shapes: string[]; edges: string[] }

// The serverless API every step of the demo is made for; the cache and its
// connector (e6) come with the AI's change
const SERVERLESS: DemoDiagram = {
    svg: SERVERLESS_SVG,
    shapes: ["cloud", "users", "apigw", "cognito", "lambda", "dynamo", "s3"],
    edges: ["e1", "e2", "e3", "e4", "e5"],
}
const ADDED_SHAPES = ["cache"]
const ADDED_EDGES = ["e6"]

// The hand edit drags S3 left; its connector from Lambda (e5) then bends.
// Coordinates are those of the exported SVG (viewBox 731 x 402).
const VIEW_WIDTH = 731
const DRAG_X = -130
const E5_STRAIGHT = "M 410 210 L 410 280.82"
const e5Bent = (dx: number) =>
    `M 410 210 L 410 250 L ${410 + dx} 250 L ${410 + dx} 280.82`

// Before the page measures itself: the header, headline and steps take
// about 300 px above the demo
const DEMO_HEIGHT = "clamp(340px, calc(100svh - 300px), 500px)"
// In the docs' column
const DOCS_HEIGHT = "400px"

// Chinese and Japanese characters stream one by one, other text word by word
const CJK = /[\u2e80-\uffef]/
const TOKENS = /[\u2e80-\uffef]|[^\s\u2e80-\uffef]+\s*|\s+/g

class Stopped extends Error {}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

export function DemoPlayer({
    texts,
    scene,
    tour,
    diagram = SERVERLESS,
}: {
    texts: DemoTexts
    /**
     * In the docs: play only this step, once the demo scrolls into view, with
     * no step tabs. The steps before it are applied at once.
     */
    scene?: number
    /** In the docs: all the steps with their tabs, once in view */
    tour?: boolean
    /** Another diagram, for the generate step only */
    diagram?: DemoDiagram
}) {
    const docs = scene !== undefined || !!tour
    const edges = useMemo(() => [...diagram.edges, ...ADDED_EDGES], [diagram])
    const uid = useId().replace(/[^a-zA-Z0-9]/g, "")
    const markup = useMemo(() => withOwnId(diagram.svg, uid), [diagram, uid])
    // The diagram's shape, for its size in the canvas
    const [, , viewWidth, viewHeight] = (
        diagram.svg.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 731 402"
    )
        .split(" ")
        .map(Number)
    const aspect = viewWidth / viewHeight
    const frame = useRef<HTMLDivElement>(null)
    const head = useRef<HTMLDivElement>(null)
    const body = useRef<HTMLDivElement>(null)
    const stage = useRef<HTMLDivElement>(null)
    const chat = useRef<HTMLDivElement>(null)
    const runId = useRef(0)
    // A wide diagram, such as the flowchart, needs less height in the docs
    const [height, setHeight] = useState(
        docs ? (aspect > 2.4 ? "340px" : DOCS_HEIGHT) : DEMO_HEIGHT,
    )
    // A docs demo has played its step, and offers to play it again
    const [finished, setFinished] = useState(false)
    // The step playing (the number of steps when the demo has ended), and
    // when it started, to restart its progress bar
    const [step, setStep] = useState({ index: 0, started: 0 })
    const [messages, setMessages] = useState<Message[]>([])
    const [composer, setComposer] = useState("")
    const [chip, setChip] = useState(false)
    const [sending, setSending] = useState(false)
    const [thinking, setThinking] = useState<string | null>(null)
    const [cursor, setCursor] = useState<Point | null>(null)
    const [dragging, setDragging] = useState(false)
    const [clicks, setClicks] = useState(0)
    // The version card whose button is being pressed
    const [pressed, setPressed] = useState<number | null>(null)
    const [selection, setSelection] = useState<Box | null>(null)
    const [outline, setOutline] = useState<Box | null>(null)
    const [editedSince, setEditedSince] = useState<number | null>(null)
    // The version the canvas shows; none after a hand edit
    const [onCanvas, setOnCanvas] = useState<number | null>(null)

    const cell = useCallback(
        (id: string) =>
            stage.current?.querySelector<SVGGElement>(
                `[data-cell-id="${id}"]`,
            ) ?? null,
        [],
    )
    // An element's box in percent of the stage, for the overlays
    const boxOf = useCallback((el: Element | null): Box | null => {
        const s = stage.current?.getBoundingClientRect()
        const r = el?.getBoundingClientRect()
        if (!s || !r) return null
        return {
            left: ((r.left - s.left) / s.width) * 100,
            top: ((r.top - s.top) / s.height) * 100,
            width: (r.width / s.width) * 100,
            height: (r.height / s.height) * 100,
        }
    }, [])
    // The pointer moves over the canvas and the chat, in pixels of the body
    const pointOf = useCallback(
        (el: Element | null | undefined): Point | null => {
            const b = body.current?.getBoundingClientRect()
            const r = el?.getBoundingClientRect()
            if (!b || !r) return null
            return {
                x: r.left - b.left + r.width / 2,
                y: r.top - b.top + r.height / 2,
            }
        },
        [],
    )
    // A point given in percent of the stage
    const stagePoint = useCallback((x: number, y: number): Point | null => {
        const b = body.current?.getBoundingClientRect()
        const s = stage.current?.getBoundingClientRect()
        if (!b || !s) return null
        return {
            x: s.left - b.left + (s.width * x) / 100,
            y: s.top - b.top + (s.height * y) / 100,
        }
    }, [])
    // The icon square of a shape, without its label
    const icon = useCallback(
        (id: string) => cell(id)?.querySelector("path") ?? null,
        [cell],
    )
    // An edge's line and arrowhead
    const edgeParts = useCallback(
        (id: string) => {
            const paths = cell(id)?.querySelector("g")?.querySelectorAll("path")
            return { line: paths?.[0] ?? null, arrow: paths?.[1] ?? null }
        },
        [cell],
    )

    // Move S3 by dx and route its connector around the new position
    const moveS3 = useCallback(
        (dx: number) => {
            // Only the serverless diagram has S3; another one may also have
            // an e5
            const s3 = cell("s3")
            if (!s3) return
            s3.setAttribute("transform", `translate(${dx} 0)`)
            const { line, arrow } = edgeParts("e5")
            line?.setAttribute("d", dx === 0 ? E5_STRAIGHT : e5Bent(dx))
            if (line && dx !== 0) line.style.strokeDasharray = "none"
            arrow?.setAttribute("transform", `translate(${dx} 0)`)
            // The "files" label sits on the middle of the new horizontal run
            cell("e5")
                ?.querySelector(":scope > g:nth-of-type(2)")
                ?.setAttribute("transform", `translate(${dx / 2} 0)`)
        },
        [cell, edgeParts],
    )

    const reset = useCallback(() => {
        moveS3(0)
        for (const id of [...diagram.shapes, ...ADDED_SHAPES, ...edges]) {
            cell(id)?.classList.remove("on", "changed")
        }
        for (const id of edges) {
            const { line } = edgeParts(id)
            if (!line) continue
            const length = Math.ceil(line.getTotalLength())
            line.style.strokeDasharray = `${length}`
            line.style.strokeDashoffset = `${length}`
        }
        setMessages([])
        setComposer("")
        setChip(false)
        setSending(false)
        setThinking(null)
        setCursor(null)
        setDragging(false)
        setPressed(null)
        setSelection(null)
        setOutline(null)
        setEditedSince(null)
        setOnCanvas(null)
        setFinished(false)
    }, [cell, diagram, edgeParts, edges, moveS3])

    const show = useCallback(
        (id: string) => {
            cell(id)?.classList.add("on")
            const { line } = edges.includes(id) ? edgeParts(id) : { line: null }
            if (line) line.style.strokeDashoffset = "0"
        },
        [cell, edgeParts, edges],
    )

    /*
     * Play the demo from step `from` to step `until`. The steps before it run
     * at once, to reach the state it starts from; with reduced motion, step
     * `from` also runs at once and the demo stops there.
     */
    const play = useCallback(
        async (from = 0, until = texts.steps.length - 1) => {
            const id = ++runId.current
            const alive = () => runId.current === id
            const reduced = window.matchMedia(
                "(prefers-reduced-motion: reduce)",
            ).matches
            const last = reduced ? from : until
            const versions = {
                draw: {
                    n: 1,
                    title: texts.versions.created,
                    summary: texts.versions.drawSummary,
                },
                cache: {
                    n: 2,
                    title: texts.versions.edited,
                    summary: texts.versions.cacheSummary,
                },
            }
            let fast = false
            const wait = (ms: number) =>
                fast
                    ? alive()
                        ? Promise.resolve()
                        : Promise.reject(new Stopped())
                    : new Promise<void>((resolve, reject) =>
                          setTimeout(
                              () =>
                                  alive() ? resolve() : reject(new Stopped()),
                              ms,
                          ),
                      )
            const type = async (text: string) => {
                if (fast) {
                    setComposer(text)
                    return
                }
                for (const ch of text) {
                    setComposer((s) => s + ch)
                    await wait(CJK.test(ch) ? 70 : 38)
                }
            }
            const send = async (
                text: string,
                working: string,
                selected?: boolean,
            ) => {
                await wait(350)
                setSending(true)
                await wait(160)
                setSending(false)
                setComposer("")
                setChip(false)
                setMessages((m) => [...m, { role: "user", text, selected }])
                setThinking(working)
                await wait(650)
                setThinking(null)
                setMessages((m) => [...m, { role: "ai", text: "" }])
            }
            // Stream the AI's reply while `work` changes the canvas
            const reply = async (text: string, work: () => Promise<void>) => {
                const tokens = text.match(TOKENS) ?? [text]
                const stream = (async () => {
                    let shown = ""
                    for (const token of tokens) {
                        shown += token
                        const part = shown
                        setMessages((m) => [
                            ...m.slice(0, -1),
                            { role: "ai", text: part },
                        ])
                        await wait(CJK.test(token) ? 28 : 55)
                    }
                })()
                await Promise.all([stream, work()])
            }
            const addVersion = (version: Version) =>
                setMessages((m) => {
                    const lastMessage = m[m.length - 1]
                    return lastMessage?.role === "ai"
                        ? [...m.slice(0, -1), { ...lastMessage, version }]
                        : m
                })
            const moveTo = async (point: Point | null, ms = 750) => {
                if (point) setCursor(point)
                await wait(ms)
            }
            const click = async () => {
                if (!fast) setClicks((n) => n + 1)
                await wait(180)
            }
            // Press the button of a version card
            const pressAction = async (n: number) => {
                setPressed(n)
                await click()
                setPressed(null)
            }
            const actionButton = (n: number) =>
                frame.current?.querySelector(`[data-demo="action-${n}"]`)
            // Scroll the chat so a version card is clear of the faded top
            // and of the bottom, as a user would before pressing its button
            const reveal = async (n: number) => {
                const list = chat.current
                const card = actionButton(n)?.closest("[data-demo-card]")
                if (!list || !card) return
                const box = list.getBoundingClientRect()
                const r = card.getBoundingClientRect()
                const top = r.top - box.top + list.scrollTop
                const target =
                    top - 56 < list.scrollTop
                        ? top - 56
                        : top + r.height + 8 > list.scrollTop + box.height
                          ? top + r.height + 8 - box.height
                          : list.scrollTop
                if (target === list.scrollTop) return
                list.scrollTo({
                    top: target,
                    behavior: fast ? "auto" : "smooth",
                })
                // Until the scroll has stopped: a longer one takes longer
                let last = -1
                for (let i = 0; i < 40 && list.scrollTop !== last; i++) {
                    last = list.scrollTop
                    await wait(60)
                }
            }
            // A restore moves S3 back or forth, as the editor loads the
            // version
            const slideS3 = (from: number, to: number, ms: number) => {
                if (fast) {
                    moveS3(to)
                    return Promise.resolve()
                }
                return new Promise<void>((resolve, reject) => {
                    const start = performance.now()
                    const frameStep = (now: number) => {
                        if (!alive()) return reject(new Stopped())
                        const t = Math.min(1, (now - start) / ms)
                        moveS3(from + (to - from) * ease(t))
                        if (t < 1) requestAnimationFrame(frameStep)
                        else resolve()
                    }
                    requestAnimationFrame(frameStep)
                })
            }
            // Drag S3 with the pointer, one animation frame at a time
            const drag = (from: Point, box: Box, dx: number, ms: number) => {
                const width = stage.current?.getBoundingClientRect().width ?? 0
                const follow = (d: number) => {
                    moveS3(d)
                    setCursor({
                        x: from.x + (d / VIEW_WIDTH) * width,
                        y: from.y,
                    })
                    setSelection({
                        ...box,
                        left: box.left + (d / VIEW_WIDTH) * 100,
                    })
                }
                if (fast) {
                    follow(dx)
                    return Promise.resolve()
                }
                return new Promise<void>((resolve, reject) => {
                    const start = performance.now()
                    const frameStep = (now: number) => {
                        if (!alive()) return reject(new Stopped())
                        const t = Math.min(1, (now - start) / ms)
                        // Render the pointer and selection in this same
                        // frame, so they stay on the shape
                        flushSync(() => follow(dx * ease(t)))
                        if (t < 1) requestAnimationFrame(frameStep)
                        else resolve()
                    }
                    requestAnimationFrame(frameStep)
                })
            }

            const steps = [
                // 1. A prompt draws the diagram, shape by shape
                async () => {
                    await wait(500)
                    await type(texts.prompts.draw)
                    await send(texts.prompts.draw, texts.drawing)
                    await reply(texts.replies.draw, async () => {
                        for (const s of diagram.shapes) {
                            show(s)
                            await wait(170)
                        }
                        for (const e of diagram.edges) {
                            show(e)
                            await wait(230)
                        }
                    })
                    addVersion(versions.draw)
                    setOnCanvas(versions.draw.n)
                    await wait(900)
                },
                // 2. Drag a shape by hand, as in draw.io
                async () => {
                    setCursor(stagePoint(70, 105))
                    await wait(50)
                    const grab = pointOf(icon("s3"))
                    const box = boxOf(icon("s3"))
                    await moveTo(grab)
                    if (grab && box) {
                        setSelection(box)
                        await wait(300)
                        setDragging(true)
                        await drag(grab, box, DRAG_X, 1000)
                        setDragging(false)
                    }
                    // S3 stays selected until the next click selects
                    // another shape
                    setEditedSince(versions.draw.n)
                    setOnCanvas(null)
                    await wait(1000)
                },
                // 3. Select a shape and ask the AI to change it
                async () => {
                    await moveTo(pointOf(icon("dynamo")))
                    await click()
                    setSelection(boxOf(icon("dynamo")))
                    setChip(true)
                    await wait(450)
                    setCursor(null)
                    await type(texts.prompts.cache)
                    await send(texts.prompts.cache, texts.changing, true)
                    await reply(texts.replies.cache, async () => {
                        await wait(250)
                        setSelection(null)
                        cell("e6")?.classList.add("changed")
                        show("cache")
                        await wait(250)
                        show("e6")
                        await wait(500)
                        setOutline(boxOf(icon("cache")))
                    })
                    addVersion(versions.cache)
                    setOnCanvas(versions.cache.n)
                    setEditedSince(null)
                    await wait(1500)
                    setOutline(null)
                    cell("e6")?.classList.remove("changed")
                },
                // 4. Restore version 1, then go back to version 2
                async () => {
                    // From where the user just typed
                    setCursor(
                        pointOf(
                            frame.current?.querySelector(
                                '[data-demo="composer"]',
                            ),
                        ),
                    )
                    await wait(50)
                    await reveal(1)
                    await moveTo(pointOf(actionButton(1)), 900)
                    await pressAction(1)
                    setOnCanvas(1)
                    cell("cache")?.classList.remove("on")
                    cell("e6")?.classList.remove("on")
                    await slideS3(DRAG_X, 0, 600)
                    await wait(1500)
                    await reveal(2)
                    await moveTo(pointOf(actionButton(2)), 700)
                    await pressAction(2)
                    setOnCanvas(2)
                    show("cache")
                    show("e6")
                    await slideS3(0, DRAG_X, 600)
                    await wait(1200)
                    setCursor(null)
                },
            ]

            try {
                reset()
                for (let i = 0; i <= last; i++) {
                    fast = reduced || i < from
                    if (i >= from) setStep({ index: i, started: Date.now() })
                    // The messages just added still rise into place; the
                    // pointer aims at where they end up
                    if (i === from && from > 0 && !reduced) await wait(400)
                    await steps[i]()
                }
                if (last === steps.length - 1) {
                    setStep({ index: steps.length, started: Date.now() })
                }
                setFinished(true)
            } catch (error) {
                if (!(error instanceof Stopped)) throw error
            }
        },
        [
            boxOf,
            cell,
            diagram,
            icon,
            moveS3,
            pointOf,
            reset,
            show,
            stagePoint,
            texts,
        ],
    )

    // The newest message stays in view, as in the editor's chat
    useLayoutEffect(() => {
        const list = chat.current
        if (list) list.scrollTop = list.scrollHeight
    }, [messages, thinking])

    // End the demo at the bottom of the first screen
    useEffect(() => {
        if (docs) return
        const fitHeight = () => {
            const top =
                (frame.current?.getBoundingClientRect().top ?? 0) +
                window.scrollY
            const steps = head.current?.offsetHeight ?? 0
            const h = Math.min(520, window.innerHeight - top - steps - 22)
            setHeight(`${Math.max(340, Math.round(h))}px`)
        }
        fitHeight()
        window.addEventListener("resize", fitHeight)
        return () => window.removeEventListener("resize", fitHeight)
    }, [docs])

    useEffect(() => {
        const stop = () => {
            runId.current++
        }
        if (docs) {
            // A page of docs can hold several demos: each starts when seen,
            // unless a click on a step tab started it already
            const before = runId.current
            const seen = new IntersectionObserver(
                ([entry]) => {
                    if (!entry.isIntersecting) return
                    seen.disconnect()
                    if (runId.current !== before) return
                    if (scene === undefined) play()
                    else play(scene, scene)
                },
                { threshold: 0.4 },
            )
            if (frame.current) seen.observe(frame.current)
            return () => {
                seen.disconnect()
                stop()
            }
        }
        const reduced = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches
        play(reduced ? texts.steps.length - 1 : 0)
        return stop
    }, [docs, play, scene, texts.steps.length])

    const versions = messages.flatMap((m) =>
        m.role === "ai" && m.version ? [m.version] : [],
    )
    const latest = versions.at(-1)
    const selectedChip = (
        <>
            <SquareDashedMousePointer className="size-3.5 shrink-0" />
            <span className="truncate">{texts.selected}</span>
        </>
    )

    return (
        <div
            ref={frame}
            className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_30px_80px_-40px_rgba(20,24,29,0.55)]"
            data-step={step.index}
        >
            {/* What the demo shows, step by step; a step can be replayed */}
            <div
                ref={head}
                className={
                    scene !== undefined
                        ? "hidden"
                        : "grid grid-cols-4 border-b border-border bg-canvas"
                }
            >
                {texts.steps.map((s, i) => {
                    const state =
                        i < step.index
                            ? "done"
                            : i === step.index
                              ? "active"
                              : "next"
                    return (
                        <button
                            key={s.title}
                            type="button"
                            onClick={() => play(i)}
                            className={`relative min-w-0 px-2 py-2 text-left md:px-4 md:py-2.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${i > 0 ? "border-l border-border" : ""} ${state === "active" ? "bg-card" : "hover:bg-card/60"}`}
                            aria-current={
                                state === "active" ? "step" : undefined
                            }
                        >
                            <span
                                className={`flex flex-col items-start gap-1 text-[12px] leading-tight font-medium md:flex-row md:items-center md:gap-2 md:text-[13px] ${state === "next" ? "text-muted-foreground" : "text-foreground"}`}
                            >
                                <span
                                    className={`flex size-[18px] shrink-0 items-center justify-center rounded-[5px] text-[11px] font-semibold tabular-nums ${
                                        state === "active"
                                            ? "bg-foreground text-background"
                                            : state === "done"
                                              ? "bg-marker-soft text-marker-ink"
                                              : "bg-muted text-muted-foreground"
                                    }`}
                                >
                                    {state === "done" ? (
                                        <Check className="size-3" />
                                    ) : (
                                        i + 1
                                    )}
                                </span>
                                {/* A phone's narrow tabs wrap the title,
                                    between words only */}
                                <span className="max-w-full [word-break:keep-all] md:truncate">
                                    {s.title}
                                </span>
                            </span>
                            {/* The docs' column and a phone are too narrow
                                for the notes */}
                            <span
                                className={`mt-0.5 hidden truncate pl-[26px] text-[12px] text-muted-foreground ${docs ? "" : "md:block"}`}
                            >
                                {s.text}
                            </span>
                            {state === "active" && (
                                <span
                                    key={step.started}
                                    className="lp-progress absolute inset-x-0 bottom-0 h-[2px] bg-marker"
                                    style={{
                                        animationDuration: `${STEP_MS[i]}ms`,
                                    }}
                                />
                            )}
                        </button>
                    )
                })}
            </div>
            {/* The demo fits the first screen: its height follows the window,
                and the diagram shrinks with it (the SVG is 731 x 402). On a
                phone the canvas is as wide as the screen, above the chat. */}
            <div
                ref={body}
                className={`relative grid grid-rows-[auto_270px] md:h-(--demo-height) md:grid-rows-1 ${docs ? "md:grid-cols-[minmax(0,1fr)_304px]" : "md:grid-cols-[minmax(0,1fr)_320px]"}`}
                style={{ "--demo-height": height } as CSSProperties}
            >
                {/* Canvas */}
                <div
                    className={`lp-grid relative flex items-center justify-center border-border px-1.5 py-10 max-md:border-b md:border-r md:py-0 ${docs ? "md:px-3" : "md:px-8"}`}
                >
                    {scene !== undefined && finished && (
                        <button
                            type="button"
                            onClick={() => play(scene, scene)}
                            className="absolute top-2 left-2 z-[3] flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 md:top-2.5 md:left-2.5 md:py-1.5 text-[12.5px] font-medium shadow-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                        >
                            <RotateCcw className="size-3.5" />
                            {texts.replay}
                        </button>
                    )}
                    <div
                        ref={stage}
                        className="lp-demo relative w-full md:max-w-(--stage-width)"
                        style={
                            {
                                "--stage-width": `min(780px, calc((${height} - 56px) * ${aspect.toFixed(3)}))`,
                            } as CSSProperties
                        }
                    >
                        <div dangerouslySetInnerHTML={{ __html: markup }} />
                        {selection && (
                            <div
                                className="lp-select pointer-events-none absolute"
                                style={inflate(selection, 0.8)}
                            />
                        )}
                        {outline && (
                            <div
                                className="lp-outline pointer-events-none absolute rounded-md border-2 border-marker"
                                style={inflate(outline, 0.9)}
                            />
                        )}
                    </div>
                </div>

                {/* Chat */}
                <div className="flex min-h-0 flex-col bg-canvas">
                    <div
                        ref={chat}
                        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 [mask-image:linear-gradient(to_bottom,transparent,#000_48px)] [scrollbar-width:none]"
                    >
                        {/* Pushes a short chat to the bottom */}
                        <div className="mt-auto" />
                        {messages.map((m, i) =>
                            m.role === "user" ? (
                                <div
                                    key={`${i}-u`}
                                    className="lp-msg ml-6 self-end rounded-2xl rounded-br-md bg-secondary px-3 py-2 text-[13px] leading-snug [text-wrap:pretty]"
                                >
                                    {m.selected && (
                                        <span className="mb-1.5 flex w-fit max-w-full items-center gap-1.5 rounded-lg bg-marker-soft px-2 py-1 text-[11.5px] font-medium text-marker-ink">
                                            {selectedChip}
                                        </span>
                                    )}
                                    {m.text}
                                </div>
                            ) : (
                                <div
                                    key={`${i}-a`}
                                    className="lp-msg text-[13px] leading-snug [text-wrap:pretty]"
                                >
                                    {m.text}
                                    {m.version && (
                                        <VersionCard
                                            version={m.version}
                                            texts={texts.versions}
                                            latest={latest === m.version}
                                            onCanvas={onCanvas === m.version.n}
                                            pressed={pressed === m.version.n}
                                            editedSince={
                                                editedSince === m.version.n
                                            }
                                            compact={docs}
                                        />
                                    )}
                                </div>
                            ),
                        )}
                        {thinking && (
                            <span className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                                <Loader2 className="size-3.5 animate-spin" />
                                {thinking}
                            </span>
                        )}
                    </div>
                    <div className="border-t border-border p-3">
                        <div
                            className="rounded-xl border border-border bg-card px-3 pt-2.5 pb-2"
                            data-demo="composer"
                        >
                            {chip && (
                                <span className="mb-1.5 inline-flex max-w-full items-center gap-1.5 rounded-lg bg-marker-soft py-1 pr-1 pl-2 text-[11.5px] font-medium text-marker-ink">
                                    {selectedChip}
                                    <X className="size-3 shrink-0" />
                                </span>
                            )}
                            <div className="flex items-end gap-2">
                                <p className="min-h-[2.6em] flex-1 text-[13px] leading-snug">
                                    {composer ? (
                                        <>
                                            {composer}
                                            <span className="lp-caret" />
                                        </>
                                    ) : (
                                        <span className="text-muted-foreground">
                                            {texts.placeholder}
                                        </span>
                                    )}
                                </p>
                                <span
                                    className={`flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform ${sending ? "scale-90" : ""}`}
                                >
                                    <ArrowUp className="size-4" />
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* The pointer moves over both the canvas and the chat; a
                    docs step that has ended leaves the shapes uncovered */}
                {cursor && !(scene !== undefined && finished) && (
                    <div
                        className={`lp-cursor pointer-events-none absolute ${dragging ? "lp-dragging" : ""}`}
                        style={{ left: `${cursor.x}px`, top: `${cursor.y}px` }}
                    >
                        <MousePointer2 className="size-5 fill-foreground text-card" />
                        {clicks > 0 && (
                            <span key={clicks} className="lp-click" />
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

/**
 * A version card like the editor's: the newest version, while the canvas
 * shows it, can be undone; any other version can be restored
 */
function VersionCard({
    version,
    texts,
    latest,
    onCanvas,
    pressed,
    editedSince,
    compact,
}: {
    version: Version
    texts: DemoTexts["versions"]
    latest: boolean
    onCanvas: boolean
    pressed: boolean
    editedSince: boolean
    /** Smaller text, for the docs' narrower chat */
    compact?: boolean
}) {
    const [Icon, action] =
        latest && onCanvas
            ? [Undo2, texts.undo]
            : [RotateCcw, version.n === 1 ? texts.restoreV1 : texts.restoreV2]
    return (
        <div
            className="lp-msg mt-2 rounded-xl border border-border bg-card px-2.5 py-2"
            data-demo-card
        >
            <div className="flex items-center gap-1.5">
                <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${onCanvas ? "bg-marker-soft text-marker-ink" : "bg-muted text-muted-foreground"}`}
                >
                    v{version.n}
                </span>
                <span
                    className={`min-w-0 flex-1 truncate font-medium ${compact ? "text-[12px]" : "text-[12.5px]"}`}
                >
                    {version.title}
                </span>
                {/* An older version the canvas shows has nothing to restore */}
                <span
                    data-demo={`action-${version.n}`}
                    className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-md transition-colors ${compact ? "px-1 text-[11px]" : "px-1.5 text-[11.5px]"} ${pressed ? "bg-accent text-foreground" : "text-muted-foreground"} ${onCanvas && !latest ? "opacity-40" : ""}`}
                >
                    <Icon className="size-3.5" />
                    {action}
                </span>
            </div>
            <span className="mt-0.5 block pl-0.5 text-[11.5px] text-muted-foreground">
                {version.summary}
            </span>
            {editedSince && (
                <span className="lp-msg mt-1 flex items-start gap-1 pl-0.5 text-[11.5px] leading-snug text-foreground/80">
                    <Pencil className="mt-0.5 size-3 shrink-0" />
                    {texts.editedSince}
                </span>
            )}
        </div>
    )
}

// A box grown by a few percent on each side, for outlines around a shape
function inflate(box: Box, by: number) {
    return {
        left: `${box.left - by}%`,
        top: `${box.top - by * 1.8}%`,
        width: `${box.width + by * 2}%`,
        height: `${box.height + by * 3.6}%`,
    }
}
