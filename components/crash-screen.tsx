"use client"

import { AlertCircle, RotateCcw } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { ReportForm, type ReportStrings } from "@/components/problem-report"
import { Button } from "@/components/ui/button"
import {
    type ErrorReport,
    recentActions,
    recordError,
} from "@/lib/client-error-report"
import type { Dictionary } from "@/lib/i18n/dictionaries"

export type CrashStrings = Dictionary["crash"]

/**
 * What shows when a page crashed while rendering: Reload, and a form to
 * report it. The error itself is recorded as soon as this shows.
 */
export function CrashScreen({
    error,
    strings,
}: {
    error: Error & { digest?: string }
    strings: { crash: CrashStrings; report: ReportStrings }
}) {
    // A server error reaches the page as a digest only
    const report = useMemo<ErrorReport>(
        () => ({
            kind: "crash",
            message: error.digest
                ? `${error.message} (digest ${error.digest})`
                : error.message,
            stack: error.stack,
            actions: recentActions(),
        }),
        [error],
    )
    const [sent, setSent] = useState(false)

    useEffect(() => {
        void recordError(report)
    }, [report])

    return (
        <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
            <div className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-6 shadow-pop">
                <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
                    <div className="min-w-0 flex-1">
                        <h1 className="text-base font-semibold">
                            {strings.crash.title}
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {strings.crash.description}
                        </p>
                        <Button
                            className="mt-4"
                            onClick={() => window.location.reload()}
                        >
                            <RotateCcw />
                            {strings.crash.reload}
                        </Button>
                    </div>
                </div>
                <div className="border-t border-border pt-4">
                    <h2 className="mb-2 text-sm font-medium">
                        {strings.report.title}
                    </h2>
                    {sent ? (
                        <p className="text-sm text-muted-foreground">
                            {strings.report.sent}
                        </p>
                    ) : (
                        <ReportForm
                            report={report}
                            strings={strings.report}
                            onDone={(kept) => {
                                if (kept) setSent(true)
                            }}
                        />
                    )}
                </div>
            </div>
        </main>
    )
}
