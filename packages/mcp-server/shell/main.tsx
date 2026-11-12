// Entry of the MCP's canvas shell, bundled by scripts/build-shell.mjs into
// dist/shell/shell.js and served at /shell/ by http-server.ts
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/canvas/locale-context"
import { DiagramProvider } from "@/contexts/diagram-context"
import { DictionaryProvider } from "@/hooks/use-dictionary"
import { CanvasShell } from "./canvas-shell"
import {
    getShellDictionary,
    pickLocale,
    shareLocaleWithDrawio,
} from "./dictionary"
import { pageShellConfig } from "./runtime-config"
import { initTheme } from "./theme"

const config = pageShellConfig()
const locale = pickLocale(config.lang, navigator.languages)
// The stylesheet picks the CJK fonts by the document's language
document.documentElement.lang = locale
// DRAWIO_LANG fixes the editor's language; without it the editor follows
// the shell's
if (!config.drawioLang) shareLocaleWithDrawio(locale)
initTheme(config.drawioDark)

const root = document.getElementById("root")
if (!root) throw new Error("The shell page has no #root element")
createRoot(root).render(
    <DictionaryProvider dictionary={getShellDictionary(locale)}>
        <LocaleProvider locale={locale}>
            <DiagramProvider>
                <CanvasShell config={config} />
            </DiagramProvider>
        </LocaleProvider>
    </DictionaryProvider>,
)
