import { Cloud } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import {
    Command,
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
    CommandShortcut,
} from "@/components/ui/command"
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export type ModelSelectorProps = ComponentProps<typeof Dialog>

export const ModelSelector = (props: ModelSelectorProps) => (
    <Dialog {...props} />
)

export type ModelSelectorTriggerProps = ComponentProps<typeof DialogTrigger>

export const ModelSelectorTrigger = (props: ModelSelectorTriggerProps) => (
    <DialogTrigger {...props} />
)

export type ModelSelectorContentProps = ComponentProps<typeof DialogContent> & {
    title?: ReactNode
}

export const ModelSelectorContent = ({
    className,
    children,
    title = "Model Selector",
    ...props
}: ModelSelectorContentProps) => (
    <DialogContent className={cn("p-0", className)} {...props}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <Command className="**:data-[slot=command-input-wrapper]:h-auto">
            {children}
        </Command>
    </DialogContent>
)

export type ModelSelectorDialogProps = ComponentProps<typeof CommandDialog>

export const ModelSelectorDialog = (props: ModelSelectorDialogProps) => (
    <CommandDialog {...props} />
)

export type ModelSelectorInputProps = ComponentProps<typeof CommandInput>

export const ModelSelectorInput = ({
    className,
    ...props
}: ModelSelectorInputProps) => (
    <CommandInput className={cn("h-auto py-3.5", className)} {...props} />
)

export type ModelSelectorListProps = ComponentProps<typeof CommandList>

export const ModelSelectorList = ({
    className,
    ...props
}: ModelSelectorListProps) => (
    <div className="relative">
        <CommandList
            className={cn(
                // Hide scrollbar on all platforms
                "[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
                className,
            )}
            {...props}
        />
        {/* Bottom shadow indicator for scrollable content */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-muted/80 via-muted/40 to-transparent" />
    </div>
)

export type ModelSelectorEmptyProps = ComponentProps<typeof CommandEmpty>

export const ModelSelectorEmpty = (props: ModelSelectorEmptyProps) => (
    <CommandEmpty {...props} />
)

export type ModelSelectorGroupProps = ComponentProps<typeof CommandGroup>

export const ModelSelectorGroup = (props: ModelSelectorGroupProps) => (
    <CommandGroup {...props} />
)

export type ModelSelectorItemProps = ComponentProps<typeof CommandItem>

export const ModelSelectorItem = (props: ModelSelectorItemProps) => (
    <CommandItem {...props} />
)

export type ModelSelectorShortcutProps = ComponentProps<typeof CommandShortcut>

export const ModelSelectorShortcut = (props: ModelSelectorShortcutProps) => (
    <CommandShortcut {...props} />
)

export type ModelSelectorSeparatorProps = ComponentProps<
    typeof CommandSeparator
>

export const ModelSelectorSeparator = (props: ModelSelectorSeparatorProps) => (
    <CommandSeparator {...props} />
)

export type ModelSelectorLogoProps = Omit<
    ComponentProps<"img">,
    "src" | "alt"
> & {
    provider: string
}

export const ModelSelectorLogo = ({
    provider,
    className,
    ...props
}: ModelSelectorLogoProps) => {
    // Use Lucide icon for bedrock since models.dev doesn't have a good AWS icon
    if (provider === "amazon-bedrock") {
        return <Cloud className={cn("size-4", className)} />
    }

    return (
        // biome-ignore lint/performance/noImgElement: External URL from models.dev
        <img
            {...props}
            alt={`${provider} logo`}
            className={cn("size-4 dark:invert", className)}
            height={16}
            src={`https://models.dev/logos/${provider}.svg`}
            width={16}
        />
    )
}

export type ModelSelectorLogoGroupProps = ComponentProps<"div">

export const ModelSelectorLogoGroup = ({
    className,
    ...props
}: ModelSelectorLogoGroupProps) => (
    <div
        className={cn(
            "-space-x-1 flex shrink-0 items-center [&>img]:rounded-full [&>img]:bg-background [&>img]:p-px [&>img]:ring-1 dark:[&>img]:bg-foreground",
            className,
        )}
        {...props}
    />
)

export type ModelSelectorNameProps = ComponentProps<"span">

export const ModelSelectorName = ({
    className,
    ...props
}: ModelSelectorNameProps) => (
    <span className={cn("flex-1 truncate text-left", className)} {...props} />
)

export type ModelSelectorSectionHeaderProps = {
    icon: ReactNode
    label: string
    className?: string
}

export const ModelSelectorSectionHeader = ({
    icon,
    label,
    className,
}: ModelSelectorSectionHeaderProps) => (
    <div
        className={cn(
            "flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/40 rounded-sm mx-1 mt-1",
            className,
        )}
    >
        <span className="[&>svg]:size-3.5" aria-hidden="true">
            {icon}
        </span>
        <span>{label}</span>
    </div>
)
