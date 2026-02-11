# Generate Diagram API 文档

## 概述

Generate Diagram API 提供异步图表生成功能,支持 XML 和图片格式输出。

## 认证

所有请求需要在 header 中包含访问码（如果配置了 `ACCESS_CODE_LIST`）：

```
x-access-code: your-access-code
```

## 端点

### 1. 创建图表生成任务

**POST** `/api/generate-diagram`

**请求体:**
```json
{
  "description": "创建一个用户登录流程图",
  "format": "xml",  // "xml" | "png" | "svg"
  "options": {
    "width": 1920,   // 可选，图片宽度
    "height": 1080   // 可选，图片高度
  }
}
```

**响应:**
```json
{
  "taskId": "task_abc123",
  "status": "pending",
  "message": "任务已创建，正在处理中"
}
```

### 2. 查询任务状态

**GET** `/api/generate-diagram/{taskId}`

**响应（进行中）:**
```json
{
  "taskId": "task_abc123",
  "status": "processing",
  "progress": 50,
  "message": "正在生成图表..."
}
```

**响应（完成 - XML）:**
```json
{
  "taskId": "task_abc123",
  "status": "completed",
  "format": "xml",
  "result": {
    "xml": "<mxfile>...</mxfile>"
  },
  "createdAt": "2026-02-10T08:00:00Z",
  "completedAt": "2026-02-10T08:00:03Z"
}
```

**响应（完成 - 图片）:**
```json
{
  "taskId": "task_abc123",
  "status": "completed",
  "format": "png",
  "result": {
    "url": "/api/generate-diagram/task_abc123/download",
    "size": 102400
  },
  "createdAt": "2026-02-10T08:00:00Z",
  "completedAt": "2026-02-10T08:00:05Z"
}
```

### 3. 下载图片

**GET** `/api/generate-diagram/{taskId}/download`

返回图片文件（PNG 或 SVG）。

## 使用示例

```javascript
// 1. 创建任务
const response = await fetch('/api/generate-diagram', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-access-code': 'your-access-code'
  },
  body: JSON.stringify({
    description: '创建一个用户登录流程图',
    format: 'png'
  })
})
const { taskId } = await response.json()

// 2. 轮询任务状态
const pollTask = async () => {
  const response = await fetch(`/api/generate-diagram/${taskId}`, {
    headers: {
      'x-access-code': 'your-access-code'
    }
  })
  const task = await response.json()

  if (task.status === 'completed') {
    console.log('图表生成完成:', task.result)
    return task
  } else if (task.status === 'failed') {
    console.error('图表生成失败:', task.error)
    return task
  } else {
    // 继续轮询
    await new Promise(resolve => setTimeout(resolve, 1000))
    return pollTask()
  }
}

const result = await pollTask()
```

## 错误码

- `400` - 请求参数错误
- `401` - 访问码无效或缺失
- `404` - 任务不存在
- `429` - 超出配额限制
- `500` - 服务器内部错误

## 配额限制

API 使用现有的配额管理系统，限制如下：
- 每日请求数：`DAILY_REQUEST_LIMIT`（默认 10）
- 每日令牌数：`DAILY_TOKEN_LIMIT`（默认 200000）
- 每分钟令牌数：`TPM_LIMIT`（默认 20000）
