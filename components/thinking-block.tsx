"use client"

import { Brain, ChevronDown, ChevronUp } from "lucide-react"
import { useState } from "react"
import Markdown from "react-markdown"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"

interface ThinkingBlockProps {
    content: string
}

export function ThinkingBlock({ content }: ThinkingBlockProps) {
    const [isExpanded, setIsExpanded] = useState(false)

    if (!content) {
        return null
    }

    return (
        <Card className="mb-4 bg-gray-50 dark:bg-gray-800 border-l-4 border-blue-500">
            <CardHeader className="p-3 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-semibold flex items-center">
                    <Brain className="w-4 h-4 mr-2 text-blue-500" />
                    Model Reasoning
                </CardTitle>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="h-auto p-1 text-xs text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900"
                >
                    {isExpanded ? (
                        <>
                            Hide <ChevronUp className="w-3 h-3 ml-1" />
                        </>
                    ) : (
                        <>
                            Show <ChevronDown className="w-3 h-3 ml-1" />
                        </>
                    )}
                </Button>
            </CardHeader>
            {isExpanded && (
                <CardContent className="p-3 pt-0 text-sm text-gray-700 dark:text-gray-300">
                    <Markdown>{content}</Markdown>
                </CardContent>
            )}
        </Card>
    )
}
