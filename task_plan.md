# 任务计划

## 目标
定位为什么一次绘图完成后会再次触发 display_diagram，并最终让新图替换旧图，而不是追加为新 page。

## 当前症状
- 一次请求内出现两次 `display_diagram` tool-call。
- 控制台显示历史消息中存在两个 `display_diagram`。
- 用户反馈：会新建 page，但原有绘图内容被替换/清空。
- 之前还出现过 `非绘图文件`、导出超时、空图导出等现象。

## 调试阶段
- [x] Phase 1: 收集用户日志证据
- [ ] Phase 2: 追踪消息流与 tool-call 生成链路
- [ ] Phase 2.5: 收集多页 E2E 运行时证据（onToolCall / handleDisplayDiagram / export 时序）
- [ ] Phase 3: 对比正常单次绘图路径与异常重复路径
- [ ] Phase 4: 形成单一根因假设
- [ ] Phase 5: 最小修复并验证

## 已知证据
- `convertToModelMessages` / `enhancedMessages` / `transformedMessages` 日志都显示有两次 `display_diagram`。
- 两次 tool-call 的 `toolCallId` 都是 `undefined`。
- 两次 tool-call 的输入预览基本相同。
- `Messages: 2 total, 2 sent to model`，但传给模型后的 `allMessages` 长度为 6，包含 assistant/tool/assistant/tool。

## 待验证假设
1. 历史消息重放时，旧的 `display_diagram` tool-call 被再次送回模型，导致模型重复执行。
2. tool-call / tool-result 缺少稳定 `toolCallId`，导致 AI SDK/上游兼容层无法正确关联，历史工具调用被当成普通上下文再次影响模型。
3. 前端在一次对话中重复追加了 assistant/tool 消息，导致后续请求把旧工具调用重新带回后端。

## 错误记录
| 现象 | 备注 |
|---|---|
| 非绘图文件 | draw.io 加载 XML 结构异常时触发 |
| Chart export timed out after 10 seconds | onFetchChart 等待导出超时 |
| 旧图被覆盖 | 当前核心问题 |
| chat-helpers 单测语法错误 | 新增 RED 测试时误写了跨行字符串，需先修正测试语法再继续观察真实失败 |
