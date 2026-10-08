import { Suspense } from "react"
import { Workspace } from "@/components/workspace/workspace"

export default function Home() {
    // The workspace reads ?session= from the URL, which needs a Suspense boundary
    return (
        <Suspense fallback={<div className="fixed inset-0 bg-canvas" />}>
            <Workspace />
        </Suspense>
    )
}
