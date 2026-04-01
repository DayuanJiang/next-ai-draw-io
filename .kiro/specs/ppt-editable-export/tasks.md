# 实现计划：PPT 可编辑导出

## 概述

基于需求文档和技术设计文档，将 EMF 和 PPTX 两种 PowerPoint 兼容格式的导出能力集成到现有图表导出体系中。实现分为以下几个阶段：类型扩展与 i18n、客户端 PPTX 生成器、服务端 EMF 转换器、UI 集成，以及 API 扩展。

## 任务

- [x] 1. 扩展类型定义与 i18n 字典
  - [x] 1.1 扩展 `ExportFormat` 类型，新增 `"emf"` 和 `"pptx"`
    - 修改 `components/save-dialog.tsx` 中的 `ExportFormat` 类型
    - _需求：1.1、2.1_
  - [x] 1.2 扩展 `TaskFormat` 类型，新增 `"emf"` 和 `"pptx"`
    - 修改 `lib/task-manager.ts` 中的 `TaskFormat` 类型
    - _需求：3.1_
  - [x] 1.3 在三种语言的 i18n 字典中新增 EMF 和 PPTX 格式文案
    - 修改 `lib/i18n/dictionaries/en.json`、`zh.json`、`ja.json`
    - 新增字段：`formats.emf`、`formats.emfDescription`、`formats.emfTooltip`、`formats.pptx`、`formats.pptxDescription`、`formats.pptxTooltip`、`pptxDegradedWarning`、`fileSizeWarning`
    - _需求：5.1、5.2、5.3_
  - [ ]* 1.4 为 i18n 多语言完整性编写属性测试
    - **属性 12：多语言格式选项完整性**
    - **验证：需求 5.1、5.2**
    - 测试文件：`lib/__tests__/i18n.property.test.ts`
    - 使用 `fc.constantFrom("en", "zh", "ja")` 生成语言参数

- [-] 2. 实现客户端 PPTX 生成器
  - [ ] 2.1 安装 `pptxgenjs` 依赖
    - 在 `package.json` 中添加 `pptxgenjs`
    - _需求：2.2_
  - [ ] 2.2 创建 `lib/pptx-generator.ts`，实现核心 XML 解析与形状映射逻辑
    - 定义 `PptxGenerationResult` 和 `PptxGenerationError` 接口
    - 实现 `generatePptxFromXml(xml: string): Promise<PptxGenerationResult>`
    - 解析 `<mxCell>` 节点，区分顶点（vertex）和边（edge）
    - 按映射表将基本形状转换为 pptxgenjs 原生形状（矩形、菱形、椭圆、圆角矩形、三角形、平行四边形）
    - 将连接线（edge）转换为 PowerPoint 连接线
    - 保留各节点的文字标签（`value` 属性）
    - 映射 `fillColor` 和 `strokeColor` 样式属性
    - 不支持的自定义形状（`shape=mxgraph.*`）降级为 SVG 图片，记录到 `degradedShapes`
    - 坐标转换：像素 / 96 = 英寸（96 DPI）
    - _需求：2.2、2.3、2.4、2.5、2.6、2.7、4.1_
  - [ ]* 2.3 为基本形状映射编写属性测试
    - **属性 3：基本形状映射为 PowerPoint 原生形状**
    - **验证：需求 2.3**
    - 测试文件：`lib/__tests__/pptx-generator.property.test.ts`
    - 使用自定义 mxGraph XML 生成器
  - [ ]* 2.4 为连接线映射编写属性测试
    - **属性 4：连接线映射为 PowerPoint 连接线**
    - **验证：需求 2.4**
    - 测试文件：`lib/__tests__/pptx-generator.property.test.ts`
    - 使用自定义边生成器
  - [ ]* 2.5 为文字内容保留编写属性测试
    - **属性 5：文字内容完整保留**
    - **验证：需求 2.5、4.2**
    - 测试文件：`lib/__tests__/pptx-generator.property.test.ts`
    - 使用 `fc.string()` 生成随机文字标签（含 Unicode）
  - [ ]* 2.6 为颜色映射编写属性测试
    - **属性 6：颜色属性正确映射**
    - **验证：需求 2.6**
    - 测试文件：`lib/__tests__/pptx-generator.property.test.ts`
    - 使用 `fc.hexaString({minLength: 6, maxLength: 6})` 生成随机颜色
  - [ ]* 2.7 为降级处理编写属性测试
    - **属性 7：不支持形状的降级处理**
    - **验证：需求 2.7**
    - 测试文件：`lib/__tests__/pptx-generator.property.test.ts`
    - 使用自定义自定义形状生成器（style 含 `shape=mxgraph.` 前缀）
  - [ ]* 2.8 为坐标转换精度编写属性测试
    - **属性 10：坐标转换精度**
    - **验证：需求 4.1**
    - 测试文件：`lib/__tests__/pptx-generator.property.test.ts`
    - 使用 `fc.float()` 生成随机坐标，验证往返误差 ≤ 2%
  - [ ]* 2.9 为 PPTX 往返属性编写属性测试
    - **属性 11：PPTX 往返属性**
    - **验证：需求 4.3**
    - 测试文件：`lib/__tests__/pptx-generator.property.test.ts`
    - 使用自定义 mxGraph XML 生成器，验证节点数量、连接关系和文字内容等价

- [ ] 3. 检查点 - 确保 PPTX 生成器所有测试通过
  - 确保所有测试通过，如有疑问请询问用户。

- [ ] 4. 实现服务端 EMF 转换器
  - [ ] 4.1 创建 `lib/emf-converter.ts`，实现 SVG → EMF 转换逻辑
    - 实现 `svgToEmf(svgBuffer: Buffer): Promise<Buffer>`
    - 实现 `isEmfConverterAvailable(): boolean`
    - 集成 `potrace` 或 `svg2emf` 库（根据可用性选择）
    - 转换失败时抛出包含详细原因的 `Error`
    - _需求：1.2、1.3_
  - [ ]* 4.2 为 EMF 文件有效性编写属性测试
    - **属性 1：EMF 文件有效性**
    - **验证：需求 1.3**
    - 测试文件：`lib/__tests__/emf-converter.property.test.ts`
    - 使用 `fc.string()` 生成随机 SVG 字符串，验证输出 Buffer 以 EMF 魔数 `0x01000000` 开头且长度大于 0
  - [ ] 4.3 创建 `app/api/export-emf/route.ts`，实现同步 EMF 导出 API
    - `POST /api/export-emf`，接受 `{ svg: string }` 请求体
    - 调用 `isEmfConverterAvailable()` 检查可用性，不可用时返回 HTTP 503
    - 调用 `svgToEmf` 转换，成功时返回 EMF 文件流（`Content-Type: image/x-emf`）
    - 转换失败时返回 HTTP 500 及错误详情
    - _需求：1.2、1.4、3.4_

- [ ] 5. 扩展 Generate Diagram API 以支持新格式
  - [ ] 5.1 修改 `app/api/generate-diagram/route.ts`，扩展 `format` 枚举
    - 将 `z.enum(["xml", "png", "svg"])` 扩展为 `z.enum(["xml", "png", "svg", "emf", "pptx"])`
    - 在 `processTask` 函数中新增 EMF 和 PPTX 格式的处理分支
    - EMF 路径：调用 `renderDiagramToImage` 获取 SVG，再调用 `svgToEmf` 转换，存储 EMF 文件
    - PPTX 路径：调用 `generateDiagramXML` 获取 XML，再调用 `generatePptxFromXml` 生成，存储 PPTX 文件
    - 转换器不可用时任务状态设为 `failed`，错误信息包含 `converter_unavailable` 标识
    - _需求：3.1、3.2、3.3、3.4_
  - [ ] 5.2 修改 `app/api/generate-diagram/[taskId]/download/route.ts`，新增 EMF 和 PPTX 的 Content-Type 映射
    - 新增 `contentTypeMap`，包含 `emf: "image/x-emf"` 和 `pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation"`
    - _需求：3.2、3.3_
  - [ ]* 5.3 为 API 格式参数验证编写属性测试
    - **属性 8：API 接受 PPT 兼容格式参数**
    - **验证：需求 3.1**
    - 测试文件：`app/api/__tests__/generate-diagram.property.test.ts`
    - 使用 `fc.constantFrom("emf", "pptx")` 验证不返回 HTTP 400
  - [ ]* 5.4 为下载端点格式响应编写属性测试
    - **属性 9：API 下载端点返回正确格式文件**
    - **验证：需求 3.2、3.3**
    - 测试文件：`app/api/__tests__/download.property.test.ts`
    - 使用 `fc.constantFrom("emf", "pptx")` 验证 Content-Type 正确

- [ ] 6. 集成 DiagramContext，扩展 `saveDiagramToFile`
  - [ ] 6.1 修改 `contexts/diagram-context.tsx`，在 `saveDiagramToFile` 中新增 PPTX 和 EMF 分支
    - `format === "pptx"` 分支：调用 `generatePptxFromXml(chartXML)`，触发浏览器下载 `.pptx` 文件
    - 若 `degradedShapes` 非空，下载完成后调用 `toast.warning` 显示降级形状列表
    - `format === "emf"` 分支：将 `latestSvg` POST 到 `/api/export-emf`，下载返回的 EMF 文件流
    - 导出文件超过 50MB 时，下载前调用 `toast.warning` 显示文件大小警告
    - 所有异常统一捕获，调用 `toast.error` 显示错误信息，对话框保持打开
    - _需求：1.2、1.4、2.8、2.9、4.4_
  - [ ]* 6.2 为单元测试编写 DiagramContext 错误处理测试
    - 测试 EMF 转换失败时显示错误 toast（示例 1.4）
    - 测试 PPTX 生成失败时显示错误 toast（示例 2.9）
    - 测试文件超过 50MB 时显示警告（示例 4.4）
    - 测试文件：`contexts/__tests__/diagram-context.test.tsx`
    - _需求：1.4、2.9、4.4_

- [ ] 7. 更新 SaveDialog UI，新增 EMF 和 PPTX 格式选项
  - [ ] 7.1 修改 `components/save-dialog.tsx`，新增 EMF 和 PPTX 格式选项
    - 在 `FORMAT_OPTIONS` 数组中新增 `emf` 和 `pptx` 选项，包含 `label`、`description`、`tooltip`、`extension` 字段
    - 为每个格式选项添加描述文字（`description`）和工具提示（`tooltip`）
    - 当图表为空（`!isRealDiagram(chartXML)`）时，禁用 EMF 和 PPTX 导出按钮
    - _需求：1.1、1.5、2.1、5.1、5.2、5.3_
  - [ ]* 7.2 为按钮状态一致性编写属性测试
    - **属性 2：EMF 导出按钮状态与图表内容一致**
    - **验证：需求 1.5**
    - 测试文件：`components/__tests__/save-dialog.property.test.ts`
    - 使用 `fc.boolean()` 模拟 `isRealDiagram` 返回值，验证按钮启用/禁用状态
  - [ ]* 7.3 为 SaveDialog 编写单元测试
    - 测试 EMF 选项显示（示例 1.1）
    - 测试 PPTX 选项显示（示例 2.1）
    - 测试 Tooltip 在 hover 时显示（示例 5.3）
    - 测试文件：`components/__tests__/save-dialog.test.tsx`
    - _需求：1.1、2.1、5.3_

- [ ] 8. 最终检查点 - 确保所有测试通过
  - 确保所有测试通过，如有疑问请询问用户。

## 备注

- 标有 `*` 的子任务为可选测试任务，可在快速 MVP 阶段跳过
- 每个任务均引用了具体需求条目，便于追溯
- 属性测试使用 `fast-check` 库，每个属性最少运行 100 次迭代
- 属性测试注释格式：`// Feature: ppt-editable-export, Property {N}: {property_text}`
- 检查点确保增量验证，避免积累问题
