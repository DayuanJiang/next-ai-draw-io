# 调试发现

## 2026-03-27
- 用户提供的服务端日志明确表明：同一次请求中，历史消息里已经包含两次 `display_diagram` tool-call。
- 这些 tool-call 在多个转换阶段都存在，说明重复并非只发生在最终请求发送前，而是更早的消息构建阶段就已出现。
- `toolCallId: undefined` 是一个高风险信号；tool result 里同样没有稳定的 call id。
- 如果工具调用没有稳定 ID，模型或 SDK 兼容层可能无法把某次 tool result 绑定到某次 tool call，导致历史消息语义错乱。
- 用户补充现象：现在会创建新 page，但旧图同步被替换，说明“追加 page”的 XML 生成可能成功，但随后又有另一次 display_diagram 使用旧/新单页 XML 覆盖了当前画布。
- 进一步排查 `app/api/chat/route.ts` 后确认：`convertToModelMessages(limitedMessages)` 之后，单个 UI assistant 消息中的历史工具片段被展开成两组 assistant/tool 历史消息，再次送回模型。
- 关键异常证据：在 `enhancedMessages`、`transformedMessages`、`allMessages` 中，两次 `display_diagram` 都还存在，且 `toolCallId` / `tool_call_id` 全是 `undefined`。
- 这说明“重复再绘制”不是 draw.io 自己重画，而是后端把历史 `display_diagram` 当作有效工具历史再次发给模型，模型随后又基于这段历史继续出图。
- 由于 call id 缺失，tool call 与 tool result 失去绑定，历史工具消息无法被可靠识别/归并，最终导致：
  1. 同一轮里出现重复 `display_diagram`
  2. 后一次 `display_diagram` 把前一次追加后的画布再次覆盖
  3. 用户看到“新建了 page，但旧内容被替换”
- 当前单一根因假设：**自定义 baseURL/兼容层返回的工具调用没有稳定 id，导致历史 `display_diagram` 在后续请求中被作为普通 assistant 工具历史重新注入模型；随后前端又执行了新的 `display_diagram`，覆盖掉原有画布。**

## 规格符合性审查要点（仅就“阻止历史 diagram 工具重放”）
- 已看到后端新增 `filterHistoricalDiagramToolMessages()`，并在 `app/api/chat/route.ts` 中于 `convertToModelMessages()` 之前对历史消息应用过滤，这是满足“阻止历史 display_diagram/edit_diagram/append_diagram 被重放”的正确切入点。
- 但该过滤器目前只检查 `msg.content`（assistant/tool 的内容块），未覆盖 AI SDK 常见的 UIMessage 结构 `msg.parts`。若客户端/SDK 实际把 tool-call/tool-result 记录在 `parts` 中，则过滤不会生效，仍可能把历史 diagram 工具片段重放进模型。
- 单测 `tests/unit/chat-helpers.test.ts` 仅覆盖 `display_diagram` 的过滤路径，未覆盖 `edit_diagram` / `append_diagram`，也未覆盖 `parts` 结构与其它可能的工具块字段命名差异（如 toolCallId/tool_call_id 仅影响绑定，但过滤主要靠 toolName/name）。
- 已新增针对 `parts` 结构的失败测试设计：assistant `parts` 内含 `append_diagram` 与 `edit_diagram` 的 tool-call/tool_use，tool `parts` 内含 tool-result，并覆盖 mixed parts 下仅移除 diagram、保留非 diagram 的预期。
- 真实 RED 已复现：`filterHistoricalDiagramToolMessages()` 只处理 `content`，导致 `parts` 结构下 diagram tool-call/tool-result 完全未被过滤，assistant/tool 空消息也不会被移除。
- 多页 E2E 当前的新证据：即便测试已改成 client-side `tool-input-start` + `tool-input-available` 序列，并且不再直接发送 `tool-output-available`，第 2/3 次 `/api/chat` 请求体导出的 `xml` 仍是空白 `<mxfile><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></mxfile>`。这说明问题不只是 mock 调用签名，更可能在 `useChat.onToolCall -> handleDisplayDiagram -> onDisplayChart/onFetchChart` 的时序或协议兼容上。
- 进一步验证后确认：`replaceNodes()` 直接消费这类 `mxGraphModel-only mxfile` 时，不会补 `<diagram>`；因此 streaming preview 产物仍是 `<mxfile><mxGraphModel>...</mxGraphModel></mxfile>`，被 `loadDiagram()` 的 `<diagram>` 强校验拒绝。
- 已做最小修复：抽出 `normalizeMxfileForDiagramLoad()`，统一把 `mxGraphModel-only mxfile` 归一化成 `<mxfile><diagram ...><mxGraphModel>...</mxGraphModel></diagram></mxfile>`；该归一化已接入 `replaceNodes()`、`loadDiagram()`、`handleDiagramExport()`。
- 回归测试已覆盖：`tests/unit/utils.test.ts` 新增 3 个用例，证明归一化函数生效、`replaceNodes()` 不再产出缺 `<diagram>` 的结果。
- 新的关键证据：E2E 失败快照显示 draw.io UI 内确实已有 2 个 page（`Page-1`、`Page B`），但第 3 次 `/api/chat` 请求体里的 `xmlAfterSecond` 只有 1 个 `<diagram>`。这说明 `onFetchChart()` 依赖的 `drawioRef.current.exportDiagram({ format: "xmlsvg" })` 不能作为“完整多页 source of truth”；它导出的更像当前页/单页结果，而不是整个多页文件。
- 最新实现证据：`lib/utils.ts` 中 `buildDisplayDiagramXml()` 的纯函数回归测试已转绿，说明“空白画布填当前页 / 非空画布追加新页”的规则已被稳定编码；剩余缺口只在 `hooks/use-diagram-tool-handlers.ts` 仍有调用链未复用该纯函数，尤其是 `append_diagram` 完成分支。
- 本轮测试设计：新增 `tests/unit/use-diagram-tool-handlers.test.tsx`，直接驱动 hook 的 `append_diagram` 完成路径，断言 `onDisplayChart` 收到的 XML 同时保留旧 page 内容并追加新 page，页数为 2。