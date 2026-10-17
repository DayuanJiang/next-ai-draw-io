# 示例图库

这些图都是 AI 根据一句提示词画出来的，包括云架构、数据库和类图、流程、计划，以及几张画作。点开一张可以放大查看；也可以复制它的提示词，或者打开编辑器，提示词会预先填好在聊天输入框里，您可以修改后再发送。

标有“Claude Code 与 MCP 服务器”的图，是 Claude Code 通过 [MCP 服务器](./claude-code.md)画的：按照服务器的要求，它看了自己画出来的截图，并修正了重叠的地方。其余的图是在网页版里画的。同一句提示词每次画出来的图都会有些不同，不同的模型画法也不一样。

<!-- demo: gallery -->

## 自己写提示词

上面这些提示词有几个共同点：

- **列出图里有哪些部分**：“customers, addresses, orders, order items, products, categories and payments”。
- **说明各部分怎样连接**：“the manager approves or rejects it, finance checks the receipts and pays”。
- **说出图的类型**：ER 图、时序图、BPMN、泳道图、甘特图。
- **需要图标时点名**：AWS、Azure、GCP、Kubernetes 或 Cisco 图标。

怎样写请求，另见[绘制和编辑](./editor.md)、[AWS 架构图](./aws-architecture.md)和[流程图和时序图](./flowcharts.md)。
