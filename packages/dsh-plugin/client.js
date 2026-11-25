window.__ModuleLoader__.load({
    id: "@next-ai-drawio/dsh",
    factory(require) {
        const {
            createElement: h,
            useEffect,
            useSyncExternalStore,
        } = require("react")
        const kind = "@next-ai-drawio/dsh:live-canvas"
        const projectionKey = "@next-ai-drawio/dsh:canvas"
        const bodySlot = "sidebar.right.pane.tab"
        const namespace = "nextAiDrawio"
        const loopback = new Set(["localhost", "127.0.0.1"])
        const en = {
            title: "Draw.io",
            description: "Open the live canvas for this conversation.",
            empty: "Ask to draw a diagram in this conversation. Its canvas will open here.",
            localOnly:
                "Open this conversation on the computer running Draw.io to use the canvas.",
        }
        const zh = {
            title: "Draw.io",
            description: "打开当前会话的实时画布。",
            empty: "在当前会话中发起绘图，实时画布会在这里打开。",
            localOnly: "请在运行 Draw.io 的电脑上打开此会话，即可使用画布。",
        }
        const panelStyle = {
            width: "100%",
            height: "100%",
            minWidth: 0,
            minHeight: 0,
            background: "var(--dsw-alias-bg-layer-1)",
        }
        const emptyStyle = {
            ...panelStyle,
            boxSizing: "border-box",
            display: "grid",
            placeItems: "center",
            padding: 24,
            color: "var(--dsw-alias-label-secondary)",
            textAlign: "center",
            fontSize: 13,
        }

        function DrawioIcon({ size = 16, className } = {}) {
            return h(
                "svg",
                {
                    width: size,
                    height: size,
                    viewBox: "0 0 20 20",
                    fill: "none",
                    stroke: "currentColor",
                    strokeWidth: 1.35,
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                    "aria-hidden": true,
                    className,
                },
                h("path", { d: "M10 7v3m-5 3v-3h10v3" }),
                h("rect", { x: 7, y: 2.5, width: 6, height: 4.5, rx: 1 }),
                h("rect", { x: 2, y: 13, width: 6, height: 4.5, rx: 1 }),
                h("rect", { x: 12, y: 13, width: 6, height: 4.5, rx: 1 }),
            )
        }

        function canEmbed(url) {
            // A loopback URL in a remote browser would reach a different computer.
            return (
                loopback.has(window.location.hostname) &&
                url.origin !== window.location.origin
            )
        }

        function Canvas({ t, useProjection }) {
            const canvas = useProjection?.(projectionKey)
            if (!canvas) return h("div", { style: emptyStyle }, t("empty"))
            const url = new URL(canvas.url)
            if (!canEmbed(url))
                return h("div", { style: emptyStyle }, t("localOnly"))
            return h("iframe", {
                src: url.href,
                title: t("title"),
                sandbox:
                    "allow-scripts allow-same-origin allow-forms allow-downloads",
                referrerPolicy: "no-referrer",
                style: { ...panelStyle, display: "block", border: 0 },
            })
        }

        function OpenCanvas({
            sessionId,
            sidebar,
            observeCanvas,
            useProjection,
        }) {
            const mounted = sidebar.mounted
            const shownSession = useSyncExternalStore(
                mounted.subscribe,
                mounted.getSnapshot,
            )
            const canvas = useProjection?.(projectionKey)
            // Effects run after the sidebar has adopted this session's store.
            useEffect(() => {
                if (mounted.getSnapshot() === sessionId)
                    observeCanvas(sessionId, canvas)
            }, [sessionId, shownSession, canvas, mounted, observeCanvas])
            return null
        }

        function observeInSidebar(sidebar) {
            const seen = new Map()
            return (sessionId, canvas) => {
                if (canvas === undefined || seen.get(sessionId) === canvas?.seq)
                    return
                // A completed turn replayed on first visit is available through
                // the guide without reopening a tab the user previously closed.
                const firstVisit = !seen.has(sessionId)
                if (
                    !canvas ||
                    (firstVisit && !canvas.reveal) ||
                    !canEmbed(new URL(canvas.url))
                ) {
                    seen.set(sessionId, canvas?.seq ?? null)
                    return
                }
                const findTab = () =>
                    sidebar.tabsIn(sessionId).find((tab) => tab.kind === kind)
                const tab = findTab()
                // A page already open in the replacement pane is revealed in
                // place. This also preserves an existing floating canvas.
                sidebar.openTabIn(
                    sessionId,
                    kind,
                    tab ? { replaceTab: tab.id } : undefined,
                )
                if (findTab()) seen.set(sessionId, canvas.seq)
            }
        }

        return {
            inject: ["locale", "sidebarRight", "sidebarRightTabs", "slots"],
            apply(ctx) {
                const { locale, sidebarRight, sidebarRightTabs, slots } = ctx
                if (typeof sidebarRight.tabsIn !== "function") return
                const t = locale.bind(namespace)
                const observeCanvas = observeInSidebar(sidebarRight)
                const observerSlot = "conversation.session.header.utilities"
                ctx.effect(() => locale.register(namespace, { en, zh }))
                ctx.effect(() =>
                    slots.inject(bodySlot, () =>
                        slots.register(
                            {
                                name: bodySlot,
                                key: kind,
                                locale: namespace,
                            },
                            Canvas,
                        ),
                    ),
                )
                ctx.effect(() =>
                    sidebarRightTabs.register({
                        id: kind,
                        kind,
                        keepMounted: true,
                        title: () => t("title"),
                        guide: [
                            {
                                id: "canvas",
                                order: 40,
                                title: () => t("title"),
                                description: () => t("description"),
                                icon: DrawioIcon,
                            },
                        ],
                    }),
                )
                ctx.effect(() =>
                    slots.inject(observerSlot, () =>
                        slots.register(
                            {
                                name: observerSlot,
                                id: kind,
                                inject: () => ({
                                    sidebar: sidebarRight,
                                    observeCanvas,
                                }),
                            },
                            OpenCanvas,
                        ),
                    ),
                )
                ctx.effect(() => () => {
                    for (const tab of sidebarRight.openTabs.getSnapshot()) {
                        if (tab.kind === kind)
                            sidebarRight.closeIn(tab.sessionId, tab.tabId)
                    }
                })
            },
        }
    },
})
