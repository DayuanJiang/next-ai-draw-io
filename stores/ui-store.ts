import { create } from "zustand"
import type { ErrorReport } from "@/lib/client-error-report"
import { noteAction } from "@/lib/user-actions"

export type SettingsTab = "models" | "general" | "drawing" | "about"
/** The models tab: its provider list, the provider picker or a provider */
export type ModelsPage = "list" | "picker" | { providerId: string }
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
    modelsPage: ModelsPage
    /** Version shown in the compare dialog, or null when closed */
    compareVersionId: string | null
    saveDialogOpen: boolean
    /** The error the report dialog is open for, or null when closed */
    problemReport: ErrorReport | null
    /** Bumped to ask the composer to take focus */
    focusComposerToken: number
    setPanelOpen: (open: boolean) => void
    setHeroDismissed: (dismissed: boolean) => void
    togglePanel: () => void
    setMobileView: (view: MobileView) => void
    /** Opens on the given tab (else the last one); the models tab on its
     * list unless a page is given */
    openSettings: (tab?: SettingsTab, modelsPage?: ModelsPage) => void
    setSettingsOpen: (open: boolean) => void
    setSettingsTab: (tab: SettingsTab) => void
    setModelsPage: (page: ModelsPage) => void
    openCompare: (versionId: string) => void
    closeCompare: () => void
    setSaveDialogOpen: (open: boolean) => void
    openProblemReport: (report: ErrorReport) => void
    closeProblemReport: () => void
    focusComposer: () => void
}

export const useUiStore = create<UiState>((set, get) => ({
    panelOpen: true,
    heroDismissed: false,
    mobileView: "chat",
    settingsOpen: false,
    settingsTab: "models",
    modelsPage: "list",
    compareVersionId: null,
    saveDialogOpen: false,
    problemReport: null,
    focusComposerToken: 0,
    setPanelOpen: (open) => set({ panelOpen: open }),
    setHeroDismissed: (dismissed) => set({ heroDismissed: dismissed }),
    togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),
    setMobileView: (view) => set({ mobileView: view }),
    openSettings: (tab, modelsPage = "list") => {
        const settingsTab = tab ?? get().settingsTab
        noteAction(`open settings ${settingsTab}`)
        set({ settingsOpen: true, settingsTab, modelsPage })
    },
    setSettingsOpen: (open) => set({ settingsOpen: open }),
    setSettingsTab: (tab) => {
        noteAction(`settings tab ${tab}`)
        set({ settingsTab: tab })
    },
    setModelsPage: (page) => set({ modelsPage: page }),
    openCompare: (versionId) => {
        // The dialog's previous and next buttons come here too
        if (!get().compareVersionId) noteAction("compare versions")
        set({ compareVersionId: versionId })
    },
    closeCompare: () => set({ compareVersionId: null }),
    setSaveDialogOpen: (open) => {
        if (open) noteAction("open save dialog")
        set({ saveDialogOpen: open })
    },
    openProblemReport: (report) => set({ problemReport: report }),
    closeProblemReport: () => set({ problemReport: null }),
    focusComposer: () =>
        set((state) => ({
            panelOpen: true,
            mobileView: "chat",
            focusComposerToken: state.focusComposerToken + 1,
        })),
}))
