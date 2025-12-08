"use client"

import { useChat } from "@ai-sdk/react"
import {
    DefaultChatTransport,
    lastAssistantMessageIsCompleteWithToolCalls,
} from "ai"
import {
    CheckCircle,
    PanelRightClose,
    PanelRightOpen,
    Settings,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { FaGithub } from "react-icons/fa"
import { Toaster } from "sonner"
import { ButtonWithTooltip } from "@/components/button-with-tooltip"
import { ChatInput } from "@/components/chat-input"
import {
    SettingsDialog,
    STORAGE_ACCESS_CODE_KEY,
} from "@/components/settings-dialog"

// localStorage keys for persistence
const STORAGE_MESSAGES_KEY = "next-ai-draw-io-messages"
const STORAGE_XML_SNAPSHOTS_KEY = "next-ai-draw-io-xml-snapshots"
const STORAGE_SESSION_ID_KEY = "next-ai-draw-io-session-id"
const STORAGE_DIAGRAM_XML_KEY = "next-ai-draw-io-diagram-xml"

import { useDiagram } from "@/contexts/diagram-context"
import { findCachedResponse } from "@/lib/cached-responses"
import { formatXML } from "@/lib/utils"
import { ChatMessageDisplay } from "./chat-message-display"

interface ChatPanelProps {
    isVisible: boolean
    onToggleVisibility: () => void
    drawioUi: "min" | "sketch"
    onToggleDrawioUi: () => void
    isMobile?: boolean
    onCloseProtectionChange?: (enabled: boolean) => void
}

export default function ChatPanel({
    isVisible,
    onToggleVisibility,
    drawioUi,
    onToggleDrawioUi,
    isMobile = false,
    onCloseProtectionChange,
}: ChatPanelProps) {
    const {
        loadDiagram: onDisplayChart,
        handleExport: onExport,
        handleExportWithoutHistory,
        resolverRef,
        chartXML,
        clearDiagram,
        isDrawioReady,
    } = useDiagram()

    const onFetchChart = (saveToHistory = true) => {
        return Promise.race([
            new Promise<string>((resolve) => {
                if (resolverRef && "current" in resolverRef) {
                    resolverRef.current = resolve
                }
                if (saveToHistory) {
                    onExport()
                } else {
                    handleExportWithoutHistory()
                }
            }),
            new Promise<string>((_, reject) =>
                setTimeout(
                    () =>
                        reject(
                            new Error(
                                "Chart export timed out after 10 seconds",
                            ),
                        ),
                    10000,
                ),
            ),
        ])
    }

    const [files, setFiles] = useState<File[]>([])
    const [showHistory, setShowHistory] = useState(false)
    const [showSettingsDialog, setShowSettingsDialog] = useState(false)
    const [, setAccessCodeRequired] = useState(false)
    const [input, setInput] = useState("")

    // Check if access code is required on mount
    useEffect(() => {
        fetch("/api/config")
            .then((res) => res.json())
            .then((data) => setAccessCodeRequired(data.accessCodeRequired))
            .catch(() => setAccessCodeRequired(false))
    }, [])

    // Generate a unique session ID for Langfuse tracing (restore from localStorage if available)
    const [sessionId, setSessionId] = useState(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem(STORAGE_SESSION_ID_KEY)
            if (saved) return saved
        }
        return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    })

    // Store XML snapshots for each user message (keyed by message index)
    const xmlSnapshotsRef = useRef<Map<number, string>>(new Map())

    // Flag to track if we've restored from localStorage
    const hasRestoredRef = useRef(false)

    // Ref to track latest chartXML for use in callbacks (avoids stale closure)
    const chartXMLRef = useRef(chartXML)
    useEffect(() => {
        chartXMLRef.current = chartXML
    }, [chartXML])

    // Ref to hold stop function for use in onToolCall (avoids stale closure)
    const stopRef = useRef<(() => void) | null>(null)

    const {
        messages,
        sendMessage,
        addToolOutput,
        stop,
        status,
        error,
        setMessages,
    } = useChat({
        transport: new DefaultChatTransport({
            api: "/api/chat",
        }),
        async onToolCall({ toolCall }) {
            if (toolCall.toolName === "display_diagram") {
                const { xml } = toolCall.input as { xml: string }

                // loadDiagram validates and returns error if invalid
                const validationError = onDisplayChart(xml)

                if (validationError) {
                    console.warn(
                        "[display_diagram] Validation error:",
                        validationError,
                    )
                    // Return error to model - sendAutomaticallyWhen will trigger retry
                    const errorMessage = `${validationError}

Please fix the XML issues and call display_diagram again with corrected XML.

Your failed XML:
\`\`\`xml
${xml}
\`\`\``
                    addToolOutput({
                        tool: "display_diagram",
                        toolCallId: toolCall.toolCallId,
                        state: "output-error",
                        errorText: errorMessage,
                    })
                } else {
                    // Success - diagram will be rendered by chat-message-display
                    addToolOutput({
                        tool: "display_diagram",
                        toolCallId: toolCall.toolCallId,
                        output: "Successfully displayed the diagram.",
                    })
                }
            } else if (toolCall.toolName === "edit_diagram") {
                const { edits } = toolCall.input as {
                    edits: Array<{ search: string; replace: string }>
                }

                let currentXml = ""
                try {
                    console.log("[edit_diagram] Starting...")
                    // Use chartXML from ref directly - more reliable than export
                    // especially on Vercel where DrawIO iframe may have latency issues
                    // Using ref to avoid stale closure in callback
                    const cachedXML = chartXMLRef.current
                    if (cachedXML) {
                        currentXml = cachedXML
                        console.log(
                            "[edit_diagram] Using cached chartXML, length:",
                            currentXml.length,
                        )
                    } else {
                        // Fallback to export only if no cached XML
                        console.log(
                            "[edit_diagram] No cached XML, fetching from DrawIO...",
                        )
                        currentXml = await onFetchChart(false)
                        console.log(
                            "[edit_diagram] Got XML from export, length:",
                            currentXml.length,
                        )
                    }

                    const { replaceXMLParts } = await import("@/lib/utils")
                    const editedXml = replaceXMLParts(currentXml, edits)

                    // loadDiagram validates and returns error if invalid
                    const validationError = onDisplayChart(editedXml)
                    if (validationError) {
                        console.warn(
                            "[edit_diagram] Validation error:",
                            validationError,
                        )
                        addToolOutput({
                            tool: "edit_diagram",
                            toolCallId: toolCall.toolCallId,
                            state: "output-error",
                            errorText: `Edit produced invalid XML: ${validationError}

Current diagram XML:
\`\`\`xml
${currentXml}
\`\`\`

Please fix the edit to avoid structural issues (e.g., duplicate IDs, invalid references).`,
                        })
                        return
                    }
                    onExport()
                    addToolOutput({
                        tool: "edit_diagram",
                        toolCallId: toolCall.toolCallId,
                        output: `Successfully applied ${edits.length} edit(s) to the diagram.`,
                    })
                    console.log("[edit_diagram] Success")
                } catch (error) {
                    console.error("[edit_diagram] Failed:", error)

                    const errorMessage =
                        error instanceof Error ? error.message : String(error)

                    // Use addToolOutput with state: 'output-error' for proper error signaling
                    addToolOutput({
                        tool: "edit_diagram",
                        toolCallId: toolCall.toolCallId,
                        state: "output-error",
                        errorText: `Edit failed: ${errorMessage}

Current diagram XML:
\`\`\`xml
${currentXml || "No XML available"}
\`\`\`

Please retry with an adjusted search pattern or use display_diagram if retries are exhausted.`,
                    })
                }
            }
        },
        onError: (error) => {
            // Silence access code error in console since it's handled by UI
            if (!error.message.includes("Invalid or missing access code")) {
                console.error("Chat error:", error)
            }

            // Add system message for error so it can be cleared
            setMessages((currentMessages) => {
                const errorMessage = {
                    id: `error-${Date.now()}`,
                    role: "system" as const,
                    content: error.message,
                    parts: [{ type: "text" as const, text: error.message }],
                }
                return [...currentMessages, errorMessage]
            })

            if (error.message.includes("Invalid or missing access code")) {
                // Show settings button and open dialog to help user fix it
                setAccessCodeRequired(true)
                setShowSettingsDialog(true)
            }
        },
        // Auto-resubmit when all tool results are available (including errors)
        // This enables the model to retry when a tool returns an error
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    })

    // Update stopRef so onToolCall can access it
    stopRef.current = stop

    // Ref to track latest messages for unload persistence
    const messagesRef = useRef(messages)
    useEffect(() => {
        messagesRef.current = messages
    }, [messages])

    const messagesEndRef = useRef<HTMLDivElement>(null)

    // Restore messages and XML snapshots from localStorage on mount
    useEffect(() => {
        if (hasRestoredRef.current) return
        hasRestoredRef.current = true

        try {
            // Restore messages
            const savedMessages = localStorage.getItem(STORAGE_MESSAGES_KEY)
            if (savedMessages) {
                const parsed = JSON.parse(savedMessages)
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setMessages(parsed)
                }
            }

            // Restore XML snapshots
            const savedSnapshots = localStorage.getItem(
                STORAGE_XML_SNAPSHOTS_KEY,
            )
            if (savedSnapshots) {
                const parsed = JSON.parse(savedSnapshots)
                xmlSnapshotsRef.current = new Map(parsed)
            }
        } catch (error) {
            console.error("Failed to restore from localStorage:", error)
        }
    }, [setMessages])

    // Restore diagram XML when DrawIO becomes ready
    const hasDiagramRestoredRef = useRef(false)
    const [canSaveDiagram, setCanSaveDiagram] = useState(false)
    useEffect(() => {
        console.log(
            "[ChatPanel] isDrawioReady:",
            isDrawioReady,
            "hasDiagramRestored:",
            hasDiagramRestoredRef.current,
        )
        if (!isDrawioReady || hasDiagramRestoredRef.current) return
        hasDiagramRestoredRef.current = true

        try {
            const savedDiagramXml = localStorage.getItem(
                STORAGE_DIAGRAM_XML_KEY,
            )
            console.log(
                "[ChatPanel] Restoring diagram, has saved XML:",
                !!savedDiagramXml,
            )
            if (savedDiagramXml) {
                console.log(
                    "[ChatPanel] Loading saved diagram XML, length:",
                    savedDiagramXml.length,
                )
                // Skip validation for trusted saved diagrams
                onDisplayChart(savedDiagramXml, true)
                chartXMLRef.current = savedDiagramXml
            }
        } catch (error) {
            console.error("Failed to restore diagram from localStorage:", error)
        }

        // Allow saving after restore is complete
        setTimeout(() => {
            console.log("[ChatPanel] Enabling diagram save")
            setCanSaveDiagram(true)
        }, 500)
    }, [isDrawioReady, onDisplayChart])

    // Save messages to localStorage whenever they change
    useEffect(() => {
        if (!hasRestoredRef.current) return
        try {
            localStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(messages))
        } catch (error) {
            console.error("Failed to save messages to localStorage:", error)
        }
    }, [messages])

    // Save XML snapshots to localStorage whenever they change
    const saveXmlSnapshots = useCallback(() => {
        try {
            const snapshotsArray = Array.from(xmlSnapshotsRef.current.entries())
            localStorage.setItem(
                STORAGE_XML_SNAPSHOTS_KEY,
                JSON.stringify(snapshotsArray),
            )
        } catch (error) {
            console.error(
                "Failed to save XML snapshots to localStorage:",
                error,
            )
        }
    }, [])

    // Save session ID to localStorage
    useEffect(() => {
        localStorage.setItem(STORAGE_SESSION_ID_KEY, sessionId)
    }, [sessionId])

    // Save current diagram XML to localStorage whenever it changes
    // Only save after initial restore is complete and if it's not an empty diagram
    useEffect(() => {
        if (!canSaveDiagram) return
        // Don't save empty diagrams (check for minimal content)
        if (chartXML && chartXML.length > 300) {
            console.log(
                "[ChatPanel] Saving diagram to localStorage, length:",
                chartXML.length,
            )
            localStorage.setItem(STORAGE_DIAGRAM_XML_KEY, chartXML)
        }
    }, [chartXML, canSaveDiagram])

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
        }
    }, [messages])

    // Save state right before page unload (refresh/close)
    useEffect(() => {
        const handleBeforeUnload = () => {
            try {
                localStorage.setItem(
                    STORAGE_MESSAGES_KEY,
                    JSON.stringify(messagesRef.current),
                )
                localStorage.setItem(
                    STORAGE_XML_SNAPSHOTS_KEY,
                    JSON.stringify(
                        Array.from(xmlSnapshotsRef.current.entries()),
                    ),
                )
                const xml = chartXMLRef.current
                if (xml && xml.length > 300) {
                    localStorage.setItem(STORAGE_DIAGRAM_XML_KEY, xml)
                }
                localStorage.setItem(STORAGE_SESSION_ID_KEY, sessionId)
            } catch (error) {
                console.error("Failed to persist state before unload:", error)
            }
        }

        window.addEventListener("beforeunload", handleBeforeUnload)
        return () =>
            window.removeEventListener("beforeunload", handleBeforeUnload)
    }, [sessionId])

    const onFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const isProcessing = status === "streaming" || status === "submitted"
        if (input.trim() && !isProcessing) {
            // Check if input matches a cached example (only when no messages yet)
            if (messages.length === 0) {
                const cached = findCachedResponse(
                    input.trim(),
                    files.length > 0,
                )
                if (cached) {
                    // Add user message and fake assistant response to messages
                    // The chat-message-display useEffect will handle displaying the diagram
                    const toolCallId = `cached-${Date.now()}`
                    setMessages([
                        {
                            id: `user-${Date.now()}`,
                            role: "user" as const,
                            parts: [{ type: "text" as const, text: input }],
                        },
                        {
                            id: `assistant-${Date.now()}`,
                            role: "assistant" as const,
                            parts: [
                                {
                                    type: "tool-display_diagram" as const,
                                    toolCallId,
                                    state: "output-available" as const,
                                    input: { xml: cached.xml },
                                    output: "Successfully displayed the diagram.",
                                },
                            ],
                        },
                    ] as any)
                    setInput("")
                    setFiles([])
                    return
                }
            }

            try {
                let chartXml = await onFetchChart()
                chartXml = formatXML(chartXml)

                // Update ref directly to avoid race condition with React's async state update
                // This ensures edit_diagram has the correct XML before AI responds
                chartXMLRef.current = chartXml

                const parts: any[] = [{ type: "text", text: input }]

                if (files.length > 0) {
                    for (const file of files) {
                        const reader = new FileReader()
                        const dataUrl = await new Promise<string>((resolve) => {
                            reader.onload = () =>
                                resolve(reader.result as string)
                            reader.readAsDataURL(file)
                        })

                        parts.push({
                            type: "file",
                            url: dataUrl,
                            mediaType: file.type,
                        })
                    }
                }

                // Save XML snapshot for this message (will be at index = current messages.length)
                const messageIndex = messages.length
                xmlSnapshotsRef.current.set(messageIndex, chartXml)
                saveXmlSnapshots()

                const accessCode =
                    localStorage.getItem(STORAGE_ACCESS_CODE_KEY) || ""
                sendMessage(
                    { parts },
                    {
                        body: {
                            xml: chartXml,
                            sessionId,
                        },
                        headers: {
                            "x-access-code": accessCode,
                        },
                    },
                )

                setInput("")
                setFiles([])
            } catch (error) {
                console.error("Error fetching chart data:", error)
            }
        }
    }

    const handleInputChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
        setInput(e.target.value)
    }

    const handleFileChange = (newFiles: File[]) => {
        setFiles(newFiles)
    }

    const handleRegenerate = async (messageIndex: number) => {
        const isProcessing = status === "streaming" || status === "submitted"
        if (isProcessing) return

        // Find the user message before this assistant message
        let userMessageIndex = messageIndex - 1
        while (
            userMessageIndex >= 0 &&
            messages[userMessageIndex].role !== "user"
        ) {
            userMessageIndex--
        }

        if (userMessageIndex < 0) return

        const userMessage = messages[userMessageIndex]
        const userParts = userMessage.parts

        // Get the text from the user message
        const textPart = userParts?.find((p: any) => p.type === "text")
        if (!textPart) return

        // Get the saved XML snapshot for this user message
        const savedXml = xmlSnapshotsRef.current.get(userMessageIndex)
        if (!savedXml) {
            console.error(
                "No saved XML snapshot for message index:",
                userMessageIndex,
            )
            return
        }

        // Restore the diagram to the saved state (skip validation for trusted snapshots)
        onDisplayChart(savedXml, true)

        // Update ref directly to ensure edit_diagram has the correct XML
        chartXMLRef.current = savedXml

        // Clean up snapshots for messages after the user message (they will be removed)
        for (const key of xmlSnapshotsRef.current.keys()) {
            if (key > userMessageIndex) {
                xmlSnapshotsRef.current.delete(key)
            }
        }
        saveXmlSnapshots()

        // Remove the user message AND assistant message onwards (sendMessage will re-add the user message)
        // Use flushSync to ensure state update is processed synchronously before sending
        const newMessages = messages.slice(0, userMessageIndex)
        flushSync(() => {
            setMessages(newMessages)
        })

        // Now send the message after state is guaranteed to be updated
        const accessCode = localStorage.getItem(STORAGE_ACCESS_CODE_KEY) || ""
        sendMessage(
            { parts: userParts },
            {
                body: {
                    xml: savedXml,
                    sessionId,
                },
                headers: {
                    "x-access-code": accessCode,
                },
            },
        )
    }

    const handleEditMessage = async (messageIndex: number, newText: string) => {
        const isProcessing = status === "streaming" || status === "submitted"
        if (isProcessing) return

        const message = messages[messageIndex]
        if (!message || message.role !== "user") return

        // Get the saved XML snapshot for this user message
        const savedXml = xmlSnapshotsRef.current.get(messageIndex)
        if (!savedXml) {
            console.error(
                "No saved XML snapshot for message index:",
                messageIndex,
            )
            return
        }

        // Restore the diagram to the saved state (skip validation for trusted snapshots)
        onDisplayChart(savedXml, true)

        // Update ref directly to ensure edit_diagram has the correct XML
        chartXMLRef.current = savedXml

        // Clean up snapshots for messages after the user message (they will be removed)
        for (const key of xmlSnapshotsRef.current.keys()) {
            if (key > messageIndex) {
                xmlSnapshotsRef.current.delete(key)
            }
        }
        saveXmlSnapshots()

        // Create new parts with updated text
        const newParts = message.parts?.map((part: any) => {
            if (part.type === "text") {
                return { ...part, text: newText }
            }
            return part
        }) || [{ type: "text", text: newText }]

        // Remove the user message AND assistant message onwards (sendMessage will re-add the user message)
        // Use flushSync to ensure state update is processed synchronously before sending
        const newMessages = messages.slice(0, messageIndex)
        flushSync(() => {
            setMessages(newMessages)
        })

        // Now send the edited message after state is guaranteed to be updated
        const accessCode = localStorage.getItem(STORAGE_ACCESS_CODE_KEY) || ""
        sendMessage(
            { parts: newParts },
            {
                body: {
                    xml: savedXml,
                    sessionId,
                },
                headers: {
                    "x-access-code": accessCode,
                },
            },
        )
    }

    // Collapsed view (desktop only)
    if (!isVisible && !isMobile) {
        return (
            <div className="h-full flex flex-col items-center pt-4 bg-card border border-border/30 rounded-xl">
                <ButtonWithTooltip
                    tooltipContent="Show chat panel (Ctrl+B)"
                    variant="ghost"
                    size="icon"
                    onClick={onToggleVisibility}
                    className="hover:bg-accent transition-colors"
                >
                    <PanelRightOpen className="h-5 w-5 text-muted-foreground" />
                </ButtonWithTooltip>
                <div
                    className="text-sm font-medium text-muted-foreground mt-8 tracking-wide"
                    style={{
                        writingMode: "vertical-rl",
                        transform: "rotate(180deg)",
                    }}
                >
                    AI Chat
                </div>
            </div>
        )
    }

    // Full view
    return (
        <div className="h-full flex flex-col bg-card shadow-soft animate-slide-in-right rounded-xl border border-border/30 relative">
            <Toaster
                position="bottom-center"
                richColors
                style={{ position: "absolute" }}
            />
            {/* Header */}
            <header
                className={`${isMobile ? "px-3 py-2" : "px-5 py-4"} border-b border-border/50`}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                            <Image
                                src="/favicon.ico"
                                alt="Next AI Drawio"
                                width={isMobile ? 24 : 28}
                                height={isMobile ? 24 : 28}
                                className="rounded"
                            />
                            <h1
                                className={`${isMobile ? "text-sm" : "text-base"} font-semibold tracking-tight whitespace-nowrap`}
                            >
                                Next AI Drawio
                            </h1>
                        </div>
                        {!isMobile && (
                            <Link
                                href="/about"
                                className="text-sm text-muted-foreground hover:text-foreground transition-colors ml-2"
                            >
                                About
                            </Link>
                        )}
                        {!isMobile && (
                            <ButtonWithTooltip
                                tooltipContent="Recent generation failures were caused by our AI provider's infrastructure issue, not the app code. After extensive debugging, I've switched providers and observed 6 hours of stability. If issues persist, please report on GitHub."
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-green-500 hover:text-green-600"
                            >
                                <CheckCircle className="h-4 w-4" />
                            </ButtonWithTooltip>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <a
                            href="https://github.com/DayuanJiang/next-ai-draw-io"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                            <FaGithub
                                className={`${isMobile ? "w-4 h-4" : "w-5 h-5"}`}
                            />
                        </a>
                        <ButtonWithTooltip
                            tooltipContent="Settings"
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowSettingsDialog(true)}
                            className="hover:bg-accent"
                        >
                            <Settings
                                className={`${isMobile ? "h-4 w-4" : "h-5 w-5"} text-muted-foreground`}
                            />
                        </ButtonWithTooltip>
                        {!isMobile && (
                            <ButtonWithTooltip
                                tooltipContent="Hide chat panel (Ctrl+B)"
                                variant="ghost"
                                size="icon"
                                onClick={onToggleVisibility}
                                className="hover:bg-accent"
                            >
                                <PanelRightClose className="h-5 w-5 text-muted-foreground" />
                            </ButtonWithTooltip>
                        )}
                    </div>
                </div>
            </header>

            {/* Messages */}
            <main className="flex-1 w-full overflow-hidden">
                <ChatMessageDisplay
                    messages={messages}
                    setInput={setInput}
                    setFiles={handleFileChange}
                    sessionId={sessionId}
                    onRegenerate={handleRegenerate}
                    onEditMessage={handleEditMessage}
                />
            </main>

            {/* Input */}
            <footer
                className={`${isMobile ? "p-2" : "p-4"} border-t border-border/50 bg-card/50`}
            >
                <ChatInput
                    input={input}
                    status={status}
                    onSubmit={onFormSubmit}
                    onChange={handleInputChange}
                    onClearChat={() => {
                        setMessages([])
                        clearDiagram()
                        const newSessionId = `session-${Date.now()}-${Math.random()
                            .toString(36)
                            .slice(2, 9)}`
                        setSessionId(newSessionId)
                        xmlSnapshotsRef.current.clear()
                        // Clear localStorage
                        localStorage.removeItem(STORAGE_MESSAGES_KEY)
                        localStorage.removeItem(STORAGE_XML_SNAPSHOTS_KEY)
                        localStorage.removeItem(STORAGE_DIAGRAM_XML_KEY)
                        localStorage.setItem(
                            STORAGE_SESSION_ID_KEY,
                            newSessionId,
                        )
                    }}
                    files={files}
                    onFileChange={handleFileChange}
                    showHistory={showHistory}
                    onToggleHistory={setShowHistory}
                    sessionId={sessionId}
                    error={error}
                    drawioUi={drawioUi}
                    onToggleDrawioUi={onToggleDrawioUi}
                />
            </footer>

            <SettingsDialog
                open={showSettingsDialog}
                onOpenChange={setShowSettingsDialog}
                onCloseProtectionChange={onCloseProtectionChange}
            />
        </div>
    )
}
