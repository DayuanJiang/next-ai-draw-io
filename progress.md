# 进度日志

## 2026-03-27
- 创建调试计划文件。
- 基于用户提供日志，优先调查消息构建链路中的重复 `display_diagram`。
- 已检查 `app/api/chat/route.ts`、`components/chat-panel.tsx`、`hooks/use-diagram-tool-handlers.ts`、`components/chat-message-display.tsx`。
- 已确认重复发生在消息重放链路，不是 draw.io 本身重复渲染。
- 已定位到高概率根因：历史工具调用缺少稳定 `toolCallId` / `tool_call_id`，在 custom baseURL 兼容链路中被再次送回模型。
- 下一步：做最小修复，优先在后端过滤历史 `display_diagram` / `append_diagram` / `edit_diagram` assistant-tool 历史，避免“出图工具历史”参与下一轮推理。
- 已按 TDD 在 `E:/next-ai-draw-io/tests/unit/chat-helpers.test.ts` 补充 `parts` 结构与 mixed parts 场景测试，准备先跑 RED。
- 首次跑测遇到测试文件语法错误（跨行字符串未闭合），已按系统化调试先修正测试语法，再重新运行以观察真实 RED。
- 真实 RED 已确认：新增的两个 `parts` 场景断言失败，证明当前过滤器仅处理 `content`。
- 已对 `E:/next-ai-draw-io/lib/chat-helpers.ts` 做最小修改：在现有分支上补充对 `parts` 的过滤与空数组消息剔除逻辑。
- 最小修复：`lib/chat-helpers.ts` 的 `shouldApplyStreamingDisplayDiagramPreview()` 不再调用未定义的 `isRealDiagram`（会导致 ReferenceError），改为：
  - `toolCallId` 以 `cached-` 开头：总是允许 streaming preview
  - 否则：仅当当前 `chartXml` 为空白画布时允许（`isBlankCanvas(chartXml) === true`）
- 测试：`npm test --silent -- tests/unit/chat-helpers.test.ts`
  - 结果：1 passed（25 tests）
- E2E 新进展：`tests/e2e/diagram-generation.spec.ts` 中 `createClientToolCallSSEResponse` 的调用点已统一为对象签名，并为两次 `display_diagram` 传入不同 `pageName`；但目标用例仍失败。
- 当前最关键证据：目标 E2E 第 2/3 次请求体导出的 `xml` 仍为空白 mxGraphModel，说明前一轮 display_diagram 的结果没有进入后续导出。
- 新增 RED/GREEN：在 `tests/unit/utils.test.ts` 补了 3 个回归测试，锁定 `mxGraphModel-only mxfile` 在 preview / load 路径下会丢失 `<diagram>` 包装的问题；`npm test --silent -- tests/unit/utils.test.ts` 现为 17 passed。
- 最小修复：`lib/utils.ts` 新增 `normalizeMxfileForDiagramLoad()`，并在 `replaceNodes()` 与 `contexts/diagram-context.tsx` 的 `loadDiagram()` / `handleDiagramExport()` 中统一归一化 `<mxfile><mxGraphModel>...</mxGraphModel></mxfile>` 为带 `<diagram>` 的结构。
- 预期影响：修复 `diagram-context.tsx:218` 的 `Invalid XML structure - missing mxfile or diagram tag`，避免 streaming preview 半图/卡住。
- 新证据：目标多页 E2E 失败时，导出的 `xmlAfterSecond` 出现 3 页且 `Page-1` 空白，说明首次 display_diagram 在空白画布也追加新 page，导致第一页不含内容。
- 最小修复：`hooks/use-diagram-tool-handlers.ts` 中 display_diagram 改为：只有当 `existingXml` 是有效 mxfile 且 `!isBlankCanvas(existingXml)` 时才追加新 page；空白画布首次出图则填充当前页。
- 验证：`npm run test:e2e -- tests/e2e/diagram-generation.spec.ts --grep "preserves the first page"` 已通过。
- 新进展：重新运行 `npm test --silent -- tests/unit/utils.test.ts`，确认 `buildDisplayDiagramXml` 相关 RED 已转为 GREEN；当前结果为 1 passed（21 tests）。
- 当前单一实现目标：把 `hooks/use-diagram-tool-handlers.ts` 中 `display_diagram` 与 `append_diagram` 都切到 `buildDisplayDiagramXml()`，修复 `append_diagram` 完成时无条件 `wrapWithMxFile(finalXml)` 导致的多页上下文丢失。
- 本轮开始：准备为 `useDiagramToolHandlers` 新增最小回归单测，先锁定 append completion 丢失多页上下文的 RED。
- RED 已确认：`npm test --silent -- "/e/next-ai-draw-io/tests/unit/use-diagram-tool-handlers.test.tsx"` 失败，`onDisplayChart` 收到的 XML 仅包含新页内容，不含旧页 `value="Old"`，说明 append 完成分支仍走单页 `wrapWithMxFile(finalXml)` 覆盖路径。