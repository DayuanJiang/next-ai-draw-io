/** A settings page's title row; the dialog's close button sits at its end */
export function SettingsHeader({ children }: { children: React.ReactNode }) {
    return (
        <header className="flex h-14 shrink-0 items-center gap-1.5 pr-14 pl-6 text-[15px]">
            {children}
        </header>
    )
}
