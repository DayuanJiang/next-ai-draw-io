# PR 提交指南

## 标题
```
feat: 新增双语支持和硅基流动AI提供商
```

## 描述
```
### 新增功能

#### ✨ 完整双语支持
- 新增i18n国际化系统，支持中英文一键切换
- 语言切换按钮位于聊天窗口右上角（带地球图标）
- 语言偏好自动保存到本地存储
- 完整覆盖所有UI组件和文本

#### 🇨🇳 硅基流动集成
- 新增硅基流动(SiliconFlow)作为AI模型提供商
- 支持OpenAI兼容API：`https://api.siliconflow.cn/v1`
- 支持从API动态获取最新模型列表
- 内置模型搜索和过滤功能
- API页面链接：`https://cloud.siliconflow.cn/me/account/ak`

### 修改文件

#### 新增
- `contexts/language-context.tsx` - 完整国际化翻译系统

#### 修改
- `app/api/chat/route.ts` - 添加硅基流动提供商逻辑
- `app/layout.tsx` - 配置LanguageProvider
- `components/chat-panel.tsx` - 添加语言切换按钮，完整翻译
- `components/chat-input.tsx` - 翻译输入框和按钮
- `components/api-config-dialog.tsx` - 添加翻译，集成硅基流动
- `components/reset-warning-modal.tsx` - 翻译警告弹窗
- `components/history-dialog.tsx` - 翻译历史对话框
- `components/chat-message-display.tsx` - 翻译消息显示
- `components/chat-example-panel.tsx` - 翻译示例面板

### 技术实现
- 使用React Context API实现全局语言状态管理
- 结构化翻译键系统，支持实时切换
- OpenAI SDK集成硅基流动API
- 完善的错误处理和用户提示

### 测试
- ✅ 应用正常启动无错误
- ✅ 双语切换功能正常
- ✅ 硅基流动配置完整
- ✅ 动态模型获取工作正常
```
