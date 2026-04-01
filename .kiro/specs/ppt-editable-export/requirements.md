# 需求文档

## 简介

本功能旨在让用户能够将 AI 生成的流程图/图表导出为可在 Microsoft PowerPoint 中直接粘贴并保持可编辑状态的格式。当前项目支持导出为 `.drawio`、PNG 和 SVG 格式，但这些格式在 PowerPoint 中均以静态图片形式插入，无法对图形元素进行二次编辑。

通过新增 **EMF（增强型图元文件）** 和/或 **PPTX 原生形状** 导出能力，用户可以将图表直接复制粘贴到 PPT 中，并对文字、形状、连接线等元素进行自由编辑，大幅提升演示文稿的制作效率。

## 词汇表

- **Diagram_Exporter**：负责将图表转换为目标格式并触发下载的模块（当前位于 `contexts/diagram-context.tsx` 的 `saveDiagramToFile` 函数）
- **Save_Dialog**：用户选择导出格式和文件名的对话框组件（`components/save-dialog.tsx`）
- **ExportFormat**：当前支持的导出格式类型（`"drawio" | "png" | "svg"`）
- **EMF**：Enhanced Metafile Format，Windows 增强型图元文件格式，PowerPoint 可将其识别为可编辑矢量图形组
- **PPTX**：Microsoft PowerPoint Open XML 格式，包含原生形状和文本框，完全可编辑
- **mxGraph_XML**：draw.io 使用的内部 XML 格式，描述图表的节点、边和样式
- **SVG_to_EMF_Converter**：将 SVG 数据转换为 EMF 格式的服务端或客户端转换器
- **PPT_Shape_Generator**：将 mxGraph XML 解析并转换为 PPTX 原生形状的生成器

## 需求

### 需求 1：导出为 EMF 格式（PowerPoint 可编辑矢量图）

**用户故事：** 作为一名需要制作演示文稿的用户，我希望能将生成的流程图导出为 EMF 格式，以便将其粘贴到 PowerPoint 后可以作为矢量图形组进行编辑。

#### 验收标准

1. THE Save_Dialog SHALL 在格式选择列表中提供 "EMF（PowerPoint 兼容）" 选项。
2. WHEN 用户选择 EMF 格式并点击保存时，THE Diagram_Exporter SHALL 将当前图表的 SVG 数据转换为 EMF 格式并下载 `.emf` 文件。
3. WHEN SVG 转 EMF 转换成功时，THE Diagram_Exporter SHALL 生成一个有效的 EMF 文件，该文件在 Microsoft PowerPoint 2016 及以上版本中可作为图形组插入。
4. IF SVG 转 EMF 转换失败，THEN THE Diagram_Exporter SHALL 向用户显示包含失败原因的错误提示，并保持对话框打开。
5. THE Diagram_Exporter SHALL 仅在图表包含实际内容（非空白模板）时启用 EMF 导出按钮。

### 需求 2：导出为 PPTX 格式（原生可编辑形状）

**用户故事：** 作为一名需要在 PPT 中深度编辑图表的用户，我希望能将流程图导出为 PPTX 文件，以便图表中的每个形状和文字都作为 PowerPoint 原生对象存在，可以独立修改颜色、文字和位置。

#### 验收标准

1. THE Save_Dialog SHALL 在格式选择列表中提供 "PPTX（可编辑形状）" 选项。
2. WHEN 用户选择 PPTX 格式并点击保存时，THE PPT_Shape_Generator SHALL 解析当前图表的 mxGraph XML 并生成包含原生形状的 `.pptx` 文件。
3. THE PPT_Shape_Generator SHALL 将 mxGraph XML 中的矩形、菱形、圆形等基本形状转换为对应的 PowerPoint 原生形状（`<p:sp>`）。
4. THE PPT_Shape_Generator SHALL 将 mxGraph XML 中的连接线转换为 PowerPoint 连接线（`<p:cxnSp>`）。
5. THE PPT_Shape_Generator SHALL 将 mxGraph XML 中各节点的文字标签保留为 PowerPoint 文本框内容。
6. THE PPT_Shape_Generator SHALL 将 mxGraph XML 中各节点的填充颜色、边框颜色映射到对应的 PowerPoint 形状样式属性。
7. IF mxGraph XML 包含 PPT_Shape_Generator 不支持的自定义形状，THEN THE PPT_Shape_Generator SHALL 将该形状以 SVG 图片形式嵌入 PPTX，并在导出完成后提示用户哪些形状已降级为图片。
8. WHEN PPTX 文件生成成功时，THE Diagram_Exporter SHALL 触发浏览器下载该 `.pptx` 文件。
9. IF PPTX 生成过程中发生错误，THEN THE Diagram_Exporter SHALL 向用户显示包含失败原因的错误提示。

### 需求 3：通过 API 支持 PPT 兼容格式导出

**用户故事：** 作为一名使用 Generate Diagram API 的开发者，我希望能通过 API 请求直接获取 EMF 或 PPTX 格式的图表，以便在自动化工作流中生成可编辑的 PPT 素材。

#### 验收标准

1. THE Generate_Diagram_API SHALL 在 `format` 参数中接受 `"emf"` 和 `"pptx"` 作为有效值。
2. WHEN API 请求的 `format` 为 `"emf"` 时，THE Generate_Diagram_API SHALL 返回任务完成后可下载 EMF 文件的 URL。
3. WHEN API 请求的 `format` 为 `"pptx"` 时，THE Generate_Diagram_API SHALL 返回任务完成后可下载 PPTX 文件的 URL。
4. IF API 请求的 `format` 为 `"emf"` 或 `"pptx"` 但服务端转换器不可用，THEN THE Generate_Diagram_API SHALL 返回 HTTP 503 状态码及说明原因的错误信息。

### 需求 4：格式转换的正确性与完整性

**用户故事：** 作为用户，我希望导出的 PPT 兼容文件能准确还原图表的视觉内容，以便减少在 PPT 中手动调整的工作量。

#### 验收标准

1. THE Diagram_Exporter SHALL 在导出 EMF 或 PPTX 时保留原始图表的整体布局，各形状的相对位置偏差不超过原始尺寸的 2%。
2. THE PPT_Shape_Generator SHALL 在生成 PPTX 时保留原始图表中所有节点的文字内容，不得出现文字丢失或乱码。
3. FOR ALL 包含有效 mxGraph XML 的图表，将其导出为 PPTX 后再通过 draw.io 重新打开该 PPTX 中嵌入的 XML 数据，SHALL 得到与原始图表等价的结构（往返属性）。
4. THE Diagram_Exporter SHALL 在导出文件大小超过 50MB 时向用户显示警告，提示文件可能过大。

### 需求 5：用户界面与本地化

**用户故事：** 作为使用中文、英文或日文界面的用户，我希望新的导出格式选项能以我的界面语言显示，以便我能清楚理解每种格式的用途。

#### 验收标准

1. THE Save_Dialog SHALL 以当前界面语言（中文、英文、日文）显示 EMF 和 PPTX 格式选项的名称和描述。
2. THE Save_Dialog SHALL 在 EMF 和 PPTX 格式选项旁显示简短说明文字，告知用户该格式适用于"在 PowerPoint 中可编辑"。
3. WHEN 用户将鼠标悬停在 EMF 或 PPTX 格式选项上时，THE Save_Dialog SHALL 显示工具提示，说明该格式的兼容性要求（如"适用于 PowerPoint 2016 及以上版本"）。
