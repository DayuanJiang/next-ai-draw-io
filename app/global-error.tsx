"use client"

import { useState } from "react"
import { CrashScreen } from "@/components/crash-screen"
import "./globals.css"

// The root layout itself crashed, so there is no dictionary and no theme
// script: English text (importing the dictionaries would add them to every
// page), and the dark theme the page had when it crashed
const STRINGS = {
    crash: {
        title: "Something went wrong",
        description: "Reload the page to continue.",
        reload: "Reload",
    },
    report: {
        button: "Report",
        title: "Report a problem",
        description:
            "What is sent: the error message below, what you write, and the names of your last few actions.",
        notePlaceholder: "What were you doing when it happened? (optional)",
        errorLabel: "Error message",
        send: "Send",
        sent: "Thanks, we got your report.",
        failed: "Could not send the report. Please try again later.",
        openGithub: "Report on GitHub",
        githubDescription:
            "This server does not collect reports. You can open a GitHub issue instead; the error message is already filled in.",
    },
}

export default function GlobalError({
    error,
}: {
    error: Error & { digest?: string }
}) {
    const [dark] = useState(
        () =>
            typeof document !== "undefined" &&
            document.documentElement.classList.contains("dark"),
    )
    return (
        <html lang="en" className={dark ? "dark" : undefined}>
            <body className="antialiased">
                <title>Something went wrong</title>
                <CrashScreen error={error} strings={STRINGS} />
            </body>
        </html>
    )
}
