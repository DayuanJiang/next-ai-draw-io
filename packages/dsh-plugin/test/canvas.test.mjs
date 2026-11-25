import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { runInNewContext } from "node:vm"
import { apply } from "../index.js"

const kind = "@next-ai-drawio/dsh:live-canvas"
const projectionKey = "@next-ai-drawio/dsh:canvas"
const tool = "mcp__drawio__start_session"
const first = "http://localhost:6002/shell/?mcp=mcp-first"
const second = "http://localhost:6002/?mcp=mcp-second"
const started = (id, url) =>
    `Session started successfully!\n\nSession ID: ${id}\nBrowser URL: ${url}\nThe drawing guide follows.`
const preview = started("mcp-first", first)
const text = (value) => [{ type: "text", text: value }]
const call = (seq, callId, name = tool) => ({
    seq,
    type: "tool/call",
    data: { name, callId },
})
const result = (seq, toolCallId, response, isError = false) => ({
    seq,
    type: "tool/result",
    data: { message: { toolCallId, isError, content: text(response) } },
})
const dispatch = (seq, response, isError = false) => ({
    seq,
    type: "tool/ptc-dispatch",
    data: { name: tool, isError, content: text(response) },
})

async function loadProjection() {
    let projection
    await apply({
        sessionProjections: {
            register: (value) => {
                projection = value
            },
        },
    })
    assert.equal(projection.key, projectionKey)
    return projection
}

test("projects successful native and PTC previews within the calling session", async () => {
    const projection = await loadProjection()
    let state = projection.init({}, 7)
    const rejected = [
        dispatch(6, preview), // Inherited event in a fork.
        call(7, "unrelated", "another_tool"),
        result(8, "unrelated", preview),
        call(9, "failed"),
        result(10, "failed", preview, true),
        dispatch(11, preview, true),
        dispatch(12, started("mcp-other", first)),
        dispatch(
            13,
            started("mcp-first", "https://example.com/shell/?mcp=mcp-first"),
        ),
        dispatch(
            14,
            started("mcp-first", "http://localhost:99999/shell/?mcp=mcp-first"),
        ),
        dispatch(
            15,
            started("mcp-first", "http://localhost:6002/other/?mcp=mcp-first"),
        ),
        dispatch(16, `Unrelated tool output\n${preview}`),
        dispatch(
            17,
            `Resumed session mcp-first.\n\nPages (1): fake\n\nCall get_diagram before edit_diagram.\n\nSession ID: mcp-first\nBrowser URL: http://localhost:6500/shell/?mcp=mcp-first\n${"x".repeat(17_000)}\n\nCall get_diagram before edit_diagram.\n\nSession ID: mcp-first\nBrowser URL: ${first}`,
        ),
    ]
    for (const event of rejected) {
        state = projection.apply(state, event)
        assert.equal(projection.wire.view(state), null)
    }
    state = projection.apply(state, call(18, "native"))
    state = projection.apply(state, result(19, "native", preview))
    assert.deepEqual(
        projection.wire.viewSchema.parse(projection.wire.view(state)),
        {
            seq: 19,
            url: first,
            reveal: true,
        },
    )
    state = projection.apply(state, dispatch(20, started("mcp-second", second)))
    assert.deepEqual(projection.stateSchema.parse(state).canvas, {
        seq: 20,
        url: second,
        reveal: true,
    })
    state = projection.apply(state, { seq: 21, type: "turn/end", data: {} })
    assert.deepEqual(projection.wire.view(state), {
        seq: 20,
        url: second,
        reveal: false,
    })
})

test("accepts resumed, already active, and previously unknown diagram IDs", async () => {
    const projection = await loadProjection()
    const responses = [
        `Resumed session mcp-first.\n\nPages (1): Page-1\n\nCall get_diagram before edit_diagram.\n\nSession ID: mcp-first\nBrowser URL: ${first}`,
        `Session mcp-first is already active: keep using it.\n\nBrowser URL: ${first} (for the user)`,
        `No saved diagram for mcp-first; starting blank.\n\nSession ID: mcp-first\nBrowser URL: ${first}`,
    ]
    for (const response of responses) {
        const state = projection.apply(
            projection.init({}, 0),
            dispatch(0, response),
        )
        assert.deepEqual(projection.wire.view(state), {
            url: first,
            seq: 0,
            reveal: true,
        })
    }
})

function observable(initial) {
    let value = initial
    const listeners = new Set()
    return {
        getSnapshot: () => value,
        subscribe(listener) {
            listeners.add(listener)
            return () => listeners.delete(listener)
        },
        set(next) {
            value = next
            for (const listener of listeners) listener()
        },
        size: () => listeners.size,
    }
}

test("opens and focuses each session's canvas, and disposes only its own tabs", async () => {
    const mounted = observable("a")
    const openTabs = observable([
        { sessionId: "a", kind: "guide", tabId: "guide" },
    ])
    const canvasA = observable({ seq: 2, url: first, reveal: false })
    const canvasB = observable(null)
    const channels = new Map([
        ["a", canvasA],
        ["b", canvasB],
    ])
    const location = { hostname: "127.0.0.1", origin: "http://127.0.0.1:49797" }
    const actions = []
    const disposers = []
    const components = new Map()
    const effects = []
    let registration
    const sidebarRight = {
        mounted,
        openTabs,
        tabsIn(sessionId) {
            return openTabs
                .getSnapshot()
                .filter((tab) => tab.sessionId === sessionId)
                .map((tab) => ({ ...tab, id: tab.tabId }))
        },
        openTabIn(sessionId, tabKind, options) {
            assert.equal(sessionId, mounted.getSnapshot())
            assert.equal(tabKind, registration.kind)
            if (options?.replaceTab) {
                assert.equal(options.replaceTab, `drawio-${sessionId}`)
                actions.push(`reveal ${sessionId}`)
                return
            }
            actions.push(`open ${sessionId}`)
            openTabs.set([
                ...openTabs.getSnapshot(),
                { sessionId, kind, tabId: `drawio-${sessionId}` },
            ])
        },
        closeIn(sessionId, tabId) {
            actions.push(`close ${sessionId}`)
            openTabs.set(
                openTabs.getSnapshot().filter((tab) => tab.tabId !== tabId),
            )
        },
    }
    const ctx = {
        sidebarRight,
        sidebarRightTabs: {
            register(definition) {
                registration = definition
                return () => {
                    registration = undefined
                }
            },
        },
        locale: { bind: () => (key) => key, register: () => () => {} },
        slots: {
            inject: (_slot, register) => register(),
            register(spec, component) {
                components.set(spec.name, { component, spec })
                return () => {
                    components.delete(spec.name)
                }
            },
        },
        effect: (setup) => disposers.push(setup()),
    }
    const source = await readFile(
        new URL("../client.js", import.meta.url),
        "utf8",
    )
    runInNewContext(source, {
        URL,
        window: {
            location,
            __ModuleLoader__: {
                load({ id, factory }) {
                    assert.equal(id, "@next-ai-drawio/dsh")
                    factory(() => ({
                        createElement: (type, props, ...children) => ({
                            type,
                            props,
                            children,
                        }),
                        useSyncExternalStore: (_subscribe, snapshot) =>
                            snapshot(),
                        useEffect: (effect) => effects.push(effect),
                    })).apply(ctx)
                },
            },
        },
    })
    assert.equal(registration.guide[0].id, "canvas")
    const render = (slot, sessionId) => {
        const { component, spec } = components.get(slot)
        return component({
            ...spec.inject?.(),
            sessionId,
            t: (key) => key,
            useProjection: (key) => {
                assert.equal(key, projectionKey)
                return channels.get(sessionId).getSnapshot()
            },
        })
    }
    const canvas = (sessionId) => render("sidebar.right.pane.tab", sessionId)
    const renderObserver = (sessionId) =>
        render("conversation.session.header.utilities", sessionId)
    const commit = (sessionId) => {
        renderObserver(sessionId)
        for (const effect of effects.splice(0)) effect()
    }
    commit("a")
    assert.deepEqual(actions, [])
    assert.equal(canvas("a").props.src, first)
    canvasA.set({ seq: 18, url: first, reveal: true })
    renderObserver("a")
    assert.deepEqual(actions, [])
    for (const effect of effects.splice(0)) effect()
    assert.deepEqual(actions, ["open a"])
    mounted.set("b")
    commit("a")
    commit("b")
    assert.equal(canvas("a").props.src, first)
    assert.equal(canvas("b").children[0], "empty")
    canvasB.set({ seq: 19, url: second, reveal: true })
    commit("b")
    assert.equal(canvas("b").props.src, second)
    mounted.set("a")
    commit("a")
    assert.deepEqual(actions, ["open a", "open b"])
    canvasA.set({ seq: 20, url: first, reveal: false })
    commit("a")
    assert.deepEqual(actions, ["open a", "open b", "reveal a"])
    location.hostname = "remote.example"
    canvasA.set({ seq: 21, url: first, reveal: true })
    commit("a")
    assert.equal(canvas("a").children[0], "localOnly")
    assert.equal(actions.length, 3)
    for (const dispose of disposers.reverse()) dispose()
    assert.deepEqual(actions, [
        "open a",
        "open b",
        "reveal a",
        "close a",
        "close b",
    ])
    assert.deepEqual(openTabs.getSnapshot(), [
        { sessionId: "a", kind: "guide", tabId: "guide" },
    ])
    assert.equal(components.size, 0)
})
