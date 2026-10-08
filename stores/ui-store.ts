import { create } from "zustand"

export type SettingsTab = "models" | "appearance" | "advanced" | "about"
export type MobileView = "canvas" | "chat"

interface UiState {
    /** Desktop: the floating chat panel is open */
    panelOpen: boolean
    /** The start screen was put away (drawing by hand, an opened file) */
    heroDismissed: boolean
    /** Phones: which half of the app is visible */
    mobileView: MobileView
    settingsOpen: boolean
    settingsTab: SettingsTab
    /** Version shown in the compare dialog, or null when closed */
    compareVersionId: string | null
    saveDialogOpen: boolean
    /** Bumped to ask the composer to take focus */
    focusComposerToken: number
    setPanelOpen: (open: boolean) => void
    setHeroDismissed: (dismissed: boolean) => void
    togglePanel: () => void
    setMobileView: (view: MobileView) => void
    openSettings: (tab?: SettingsTab) => void
    setSettingsOpen: (open: boolean) => void
    setSettingsTab: (tab: SettingsTab) => void
    openCompare: (versionId: string) => void
    closeCompare: () => void
    setSaveDialogOpen: (open: boolean) => void
    focusComposer: () => void
}

export const useUiStore = create<UiState>((set) => ({
    panelOpen: true,
    heroDismissed: false,
    mobileView: "chat",
    settingsOpen: false,
    settingsTab: "models",
    compareVersionId: null,
    saveDialogOpen: false,
    focusComposerToken: 0,
    setPanelOpen: (open) => set({ panelOpen: open }),
    setHeroDismissed: (dismissed) => set({ heroDismissed: dismissed }),
    togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),
    setMobileView: (view) => set({ mobileView: view }),
    openSettings: (tab) =>
        set((state) => ({
            settingsOpen: true,
            settingsTab: tab ?? state.settingsTab,
        })),
    setSettingsOpen: (open) => set({ settingsOpen: open }),
    setSettingsTab: (tab) => set({ settingsTab: tab }),
    openCompare: (versionId) => set({ compareVersionId: versionId }),
    closeCompare: () => set({ compareVersionId: null }),
    setSaveDialogOpen: (open) => set({ saveDialogOpen: open }),
    focusComposer: () =>
        set((state) => ({
            panelOpen: true,
            mobileView: "chat",
            focusComposerToken: state.focusComposerToken + 1,
        })),
}))
