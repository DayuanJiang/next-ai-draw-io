"use client"

import { ImageIcon } from "lucide-react"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip"

interface ImageGenerationConfigProps {
    enabled: boolean
    onEnabledChange: (enabled: boolean) => void
    resolution: string
    onResolutionChange: (resolution: string) => void
    aspectRatio: string
    onAspectRatioChange: (aspectRatio: string) => void
}

export function ImageGenerationConfig({
    enabled,
    onEnabledChange,
    resolution,
    onResolutionChange,
    aspectRatio,
    onAspectRatioChange,
}: ImageGenerationConfigProps) {
    return (
        <div className="px-2 py-1 border-b border-border/50 bg-card/30">
            <div className="flex items-center gap-2 flex-wrap">
                {/* 开关按钮 */}
                <div className="flex items-center gap-1.5">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-1">
                                <Label
                                    htmlFor="image-generation-toggle"
                                    className="text-sm cursor-pointer whitespace-nowrap"
                                >
                                    🍌
                                </Label>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                            <p className="text-xs max-w-xs">
                                启用后使用 Gemini 3 Pro Image
                                生成图片，而不是创建图表
                            </p>
                        </TooltipContent>
                    </Tooltip>
                    <Switch
                        id="image-generation-toggle"
                        checked={enabled}
                        onCheckedChange={onEnabledChange}
                        className="scale-90"
                    />
                </div>

                {/* 分辨率选择 */}
                {enabled && (
                    <>
                        <div className="flex items-center gap-1.5">
                            <Label
                                htmlFor="resolution-select"
                                className="text-xs whitespace-nowrap"
                            >
                                分辨率
                            </Label>
                            <Select
                                value={resolution}
                                onValueChange={onResolutionChange}
                            >
                                <SelectTrigger
                                    id="resolution-select"
                                    className="w-16 h-4 text-xs"
                                >
                                    <SelectValue placeholder="1K" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1K">1K</SelectItem>
                                    <SelectItem value="2K">2K</SelectItem>
                                    <SelectItem value="4K">4K</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* 尺寸（宽高比）选择 */}
                        <div className="flex items-center gap-1.5">
                            <Label
                                htmlFor="aspect-ratio-select"
                                className="text-xs whitespace-nowrap"
                            >
                                尺寸
                            </Label>
                            <Select
                                value={aspectRatio}
                                onValueChange={onAspectRatioChange}
                            >
                                <SelectTrigger
                                    id="aspect-ratio-select"
                                    className="w-20 h-4 text-xs"
                                >
                                    <SelectValue placeholder="1:1" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1:1">1:1</SelectItem>
                                    <SelectItem value="2:3">2:3</SelectItem>
                                    <SelectItem value="3:2">3:2</SelectItem>
                                    <SelectItem value="3:4">3:4</SelectItem>
                                    <SelectItem value="4:3">4:3</SelectItem>
                                    <SelectItem value="4:5">4:5</SelectItem>
                                    <SelectItem value="5:4">5:4</SelectItem>
                                    <SelectItem value="9:16">9:16</SelectItem>
                                    <SelectItem value="16:9">16:9</SelectItem>
                                    <SelectItem value="21:9">21:9</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
