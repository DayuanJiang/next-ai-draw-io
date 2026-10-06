import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SecretInput, SettingField } from "@/app/[lang]/admin/setting-field"
import { DictionaryProvider } from "@/hooks/use-dictionary"
import type { SettingDef } from "@/lib/admin/settings-registry"
import type { Dictionary } from "@/lib/i18n/dictionaries"
import en from "@/lib/i18n/dictionaries/en.json"

const STORED = { isSet: true as const, hint: "…abcd" }

function withDict(node: ReactNode) {
    return (
        <DictionaryProvider dictionary={en as unknown as Dictionary}>
            {node}
        </DictionaryProvider>
    )
}

function typeInto(label: string, text: string) {
    fireEvent.change(screen.getByLabelText(label, { selector: "input" }), {
        target: { value: text },
    })
}

afterEach(cleanup)

describe("SecretInput", () => {
    it("reverts to a key saved after mount instead of deleting it", () => {
        const onChange = vi.fn()
        const props = { id: "secret", keepOnEmpty: true, onChange }
        // New provider: nothing stored at mount, then saved
        const { rerender } = render(
            withDict(
                <>
                    <label htmlFor="secret">secret</label>
                    <SecretInput {...props} value={undefined} />
                </>,
            ),
        )
        rerender(
            withDict(
                <>
                    <label htmlFor="secret">secret</label>
                    <SecretInput {...props} value={STORED} />
                </>,
            ),
        )
        rerender(
            withDict(
                <>
                    <label htmlFor="secret">secret</label>
                    <SecretInput {...props} value="abc" />
                </>,
            ),
        )

        typeInto("secret", "")
        expect(onChange).toHaveBeenLastCalledWith(STORED)
    })
})

describe("SettingField secret", () => {
    const def: SettingDef = {
        key: "LANGFUSE_SECRET_KEY",
        group: "observability",
        type: "secret",
        label: "Langfuse Secret Key",
    }

    it("drops the pending change when a saved secret is typed over and cleared", () => {
        const onChange = vi.fn()
        const props = {
            def,
            state: { key: def.key, source: "file" as const, value: STORED },
            disabled: false,
            onChange,
        }
        const { rerender } = render(
            withDict(<SettingField {...props} pendingValue={undefined} />),
        )
        rerender(withDict(<SettingField {...props} pendingValue="a" />))

        typeInto(en.admin.settings.LANGFUSE_SECRET_KEY.label, "")
        expect(onChange).toHaveBeenLastCalledWith(undefined)
    })
})
