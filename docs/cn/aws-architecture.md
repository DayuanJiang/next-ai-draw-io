# 用文字生成 AWS 架构图

用文字描述您的系统，Next AI Draw.io 就会使用 draw.io `aws4` 图形库中的 AWS 官方图标画出 AWS 架构图。它免费、开源，画出来的是普通的 draw.io 图表：可以手动修改，也可以导出为 `.drawio`、`.png` 或 `.svg`。本页介绍如何得到一份不错的初稿，以及如何继续完善它。

## 从描述开始

在编辑器里描述这个系统：它由哪些部分组成，请求或数据怎样在它们之间流动。例如：

```text
在 AWS 上画一个无服务器 REST API：API Gateway 在 Lambda 前面，Cognito 负责登录，DynamoDB 存数据，S3 存上传的文件。除了用户之外，其他所有内容都放在一个 AWS Cloud 分组里。
```

AI 在画图之前会先查阅 AWS 图形库，所以每个服务都会用上它真正的图标，不会只画成一个普通方框。

有帮助的做法：

- **写出服务名称。** 只说“数据库”，可能会画成任何一种数据库；写“DynamoDB”，就会用上 DynamoDB 的图标。
- **说明哪些内容要分组。** AWS Cloud、区域、VPC、可用区、公有子网和私有子网。
- **说明流向。** 例如“从左到右，从用户到数据库”。
- 请求或数据的方向很重要时，**要求使用动画连接线**。

<!-- demo: generate -->

## 从已有的材料开始

- **截图或白板照片**：上传后，让 AI 用 AWS 图标重画。
- **PDF 或设计文档**：上传后，让 AI 画出其中描述的架构。
- **您的基础设施代码**：借助 MCP 服务器，Claude Code 或 Cursor 可以读取您的 Terraform、CDK 或 CloudFormation 文件，并画出其中定义的内容。见[在 Claude Code 里使用](./claude-code.md)。

```text
读取 infra/ 里的 Terraform 文件，画出它们创建的 AWS 架构，按 VPC 和子网分组
```

## 继续完善

- **手动移动图形**，放到您想要的位置。AI 下次修改前会先读取您的布局。
- **选中一个服务并要求修改**，例如“在它前面加一层缓存”。
- **撤销出错的修改。** AI 的每次修改都是一个版本：可以在它的卡片上撤销，或者恢复更早的版本。

## 示例

![使用 React 和 AWS 的认证流程](../../public/auth.svg)

提示词：“Generate authentication process using React with AWS. Use Serverless architecture.”

## 导出

- **.drawio** 文件的所有内容都能继续编辑，在本应用或 draw.io 里都可以。
- **PNG** 是用于幻灯片和文档的图片。
- **SVG** 是放大也不会模糊的图片。
