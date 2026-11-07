"use client"

import { ExternalLink, Loader2, Send } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useDictionary } from "@/hooks/use-dictionary"
import {
    type ErrorReport,
    githubIssueUrl,
    isAppError,
    recordError,
    reportsEnabled,
    sendErrorReport,
} from "@/lib/client-error-report"
import type { Dictionary } from "@/lib/i18n/dictionaries"
import { useUiStore } from "@/stores/ui-store"

export type ReportStrings = Dictionary["report"]

/**
 * The error message, a box for what the user was doing, and Send. On a
 * server that does not keep reports, Send becomes a link to a new GitHub
 * issue with the same text. Strings come in as props: the crash page of
 * the root layout has no dictionary.
 */
export function ReportForm({
    report,
    strings,
    onDone,
    children,
}: {
    report: ErrorReport
    strings: ReportStrings
    /** Sent: kept by this server (true) or opened on GitHub (false) */
    onDone: (kept: boolean) => void
    /** Buttons before Send, such as Cancel */
    children?: React.ReactNode
}) {
    const [note, setNote] = useState("")
    const [enabled, setEnabled] = useState<boolean | null>(null)
    const [sending, setSending] = useState(false)
    const [failed, setFailed] = useState(false)

    useEffect(() => {
        let current = true
        reportsEnabled().then((value) => {
            if (current) setEnabled(value)
        })
        return () => {
            current = false
        }
    }, [])

    const send = async () => {
        setSending(true)
        setFailed(false)
        const sent = await sendErrorReport({ ...report, note: note.trim() })
        setSending(false)
        if (sent) onDone(true)
        else setFailed(true)
    }

    const openGithub = () => {
        window.open(
            githubIssueUrl({ ...report, note }),
            "_blank",
            "noopener,noreferrer",
        )
        onDone(false)
    }

    return (
        <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
                {enabled === false
                    ? strings.githubDescription
                    : strings.description}
            </p>
            <div>
                <p className="text-xs font-medium text-muted-foreground">
                    {strings.errorLabel}
                </p>
                <p className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 font-mono text-xs text-foreground">
                    {report.message}
                </p>
            </div>
            <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={strings.notePlaceholder}
                maxLength={2000}
                rows={3}
                aria-label={strings.notePlaceholder}
                data-testid="report-note"
            />
            {failed && (
                <p className="text-sm text-destructive">{strings.failed}</p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
                {children}
                {enabled === false ? (
                    <Button onClick={openGithub}>
                        <ExternalLink />
                        {strings.openGithub}
                    </Button>
                ) : (
                    <Button
                        onClick={send}
                        disabled={sending || enabled === null}
                        data-testid="report-send"
                    >
                        {sending ? (
                            <Loader2 className="animate-spin" />
                        ) : (
                            <Send />
                        )}
                        {strings.send}
                    </Button>
                )}
            </div>
        </div>
    )
}

/**
 * Mounted once in the layout: records errors that nothing caught, and
 * shows the report dialog that error toasts and chat error cards open
 */
export function ProblemReports() {
    const dict = useDictionary()
    const report = useUiStore((s) => s.problemReport)
    const close = useUiStore((s) => s.closeProblemReport)

    useEffect(() => {
        const record = (error: unknown) => {
            if (isAppError(error)) {
                void recordError({
                    kind: "uncaught",
                    message: error.message,
                    stack: error.stack,
                })
            }
        }
        const onError = (event: ErrorEvent) => record(event.error)
        const onRejection = (event: PromiseRejectionEvent) =>
            record(event.reason)
        window.addEventListener("error", onError)
        window.addEventListener("unhandledrejection", onRejection)
        return () => {
            window.removeEventListener("error", onError)
            window.removeEventListener("unhandledrejection", onRejection)
        }
    }, [])

    if (!report) return null
    return (
        <Dialog open onOpenChange={(open) => !open && close()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{dict.report.title}</DialogTitle>
                    {/* The form says what is sent */}
                    <DialogDescription className="sr-only">
                        {dict.report.description}
                    </DialogDescription>
                </DialogHeader>
                <ReportForm
                    report={report}
                    strings={dict.report}
                    onDone={(kept) => {
                        close()
                        if (kept) toast.success(dict.report.sent)
                    }}
                >
                    <Button variant="outline" onClick={close}>
                        {dict.common.cancel}
                    </Button>
                </ReportForm>
            </DialogContent>
        </Dialog>
    )
}
