"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

type Language = "zh" | "en";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations = {
  zh: {
    // Chat Panel
    "chat.title": "Next-AI-Drawio",
    "chat.configured": "已配置",
    "chat.notConfigured": "未配置 API",
    "chat.config": "配置",
    "chat.github": "GitHub",

    // Chat Input
    "chat.placeholder": "描述您想要对图表进行的修改\n或上传(粘贴)图片来复制图表\n(按 Cmd/Ctrl + Enter 发送)",
    "chat.input": "聊天输入框",
    "chat.clearTooltip": "清空当前对话和图表",
    "chat.history": "图表历史",
    "chat.historyTooltip": "查看图表历史",
    "chat.uploadImage": "上传图片",
    "chat.send": "发送",
    "chat.sending": "发送中...",

    // API Config Dialog
    "config.title": "AI 模型配置",
    "config.provider": "AI 提供商",
    "config.modelsAvailable": "个模型可用",
    "config.apiKey": "API Key",
    "config.apiKeyStored": "你的 API Key 只会存储在本地浏览器中",
    "config.getApiKey": "获取 API Key",
    "config.viewModels": "查看模型列表",
    "config.model": "模型",
    "config.getModels": "获取模型列表",
    "config.fetching": "获取中...",
    "config.searchModels": "搜索模型...",
    "config.save": "保存配置",
    "config.cancel": "取消",

    // Providers
    "provider.openai": "OpenAI",
    "provider.openrouter": "OpenRouter",
    "provider.google": "Google Gemini",
    "provider.siliconflow": "SiliconFlow (硅基流动)",

    // Messages
    "message.configureFirst": "请先配置 AI 提供商设置",
    "message.displayDiagram": "成功显示图表",
    "message.editDiagram": "成功应用编辑",
    "message.editFailed": "编辑图表失败",
    "message.fetchModelsUnsupported": "此提供商不支持动态获取模型列表",
    "message.fetchModelsError": "获取模型列表失败，请检查 API Key 是否正确",
    "message.tool": "工具",
    "message.hideArgs": "隐藏参数",
    "message.showArgs": "显示参数",
    "message.input": "输入",
    "message.diagramGenerated": "图表已生成",
    "message.diagramEdited": "图表已编辑",
    "message.toolExecuted": "工具已执行",
    "message.diagramError": "生成图表错误",
    "message.editError": "编辑图表错误",
    "message.toolError": "工具错误",
    "message.error": "错误",

    // Modal
    "modal.clearTitle": "清空所有内容？",
    "modal.clearDescription": "这将清空当前对话并重置图表。此操作无法撤销。",
    "modal.clearAll": "清空所有",
    "modal.cancel": "取消",

    // History
    "history.title": "图表历史",
    "history.description": "这里保存了每次 AI 修改前的图表。\n点击图表以恢复",
    "history.empty": "还没有历史记录。发送消息来创建图表历史。",
    "history.version": "版本",
    "history.close": "关闭",

    // Example Panel
    "example.startConversation": "开始对话以生成或修改图表。",
    "example.uploadImages": "您也可以上传图片作为参考。",
    "example.tryExamples": "试试这些例子：",
    "example.createAwsStyle": "创建 aws 风格的图表",
    "example.replicateFlowchart": "复制此流程图",
    "example.drawCat": "画一只猫",

    // Quick Start
    "quick.title": "Next AI Draw.io 快速启动",
    "quick.commands": "一键启动命令",
    "quick.access": "访问应用",
    "quick.config": "AI 配置",
    "quick.providers": "支持的提供商",
    "quick.openai": "OpenAI (推荐)",
    "quick.openai.keyFormat": "API Key 格式",
    "quick.openai.recommendedModel": "推荐模型",
    "quick.openrouter": "OpenRouter (性价比高)",
    "quick.openrouter.dynamicModels": "支持动态获取模型列表",
    "quick.google": "Google Gemini",
    "quick.siliconflow": "SiliconFlow (硅基流动) (国产性价比高)",
    "quick.siliconflow.dynamicSearch": "支持动态获取模型列表和搜索",
    "quick.usage": "使用说明",
    "quick.step1": "首次使用时，点击右上角的\"配置\"按钮",
    "quick.step2": "选择你偏好的 AI 提供商",
    "quick.step3": "输入对应的 API Key",
    "quick.step4": "（可选）对于 OpenRouter 和 SiliconFlow，点击\"获取模型列表\"按钮动态获取最新模型",
    "quick.step5": "（可选）在搜索框中输入关键词来过滤模型列表",
    "quick.step6": "选择模型（可选，默认使用推荐模型）",
    "quick.step7": "点击\"保存配置\"",
    "quick.step8": "开始使用自然语言创建和编辑图表！",
    "quick.advanced": "高级功能",
    "quick.dynamicModels": "动态模型获取",
    "quick.dynamicModels.desc": "OpenRouter 和 SiliconFlow 提供商支持点击\"获取模型列表\"按钮来获取最新的模型列表",
    "quick.modelSearch": "模型搜索",
    "quick.modelSearch.desc": "支持在搜索框中输入关键词来过滤模型",
    "quick.apiLinks": "API 页面跳转",
    "quick.apiLinks.desc": "点击\"获取 API Key\"或\"查看模型列表\"链接可直接跳转到对应的服务页面",
    "quick.notes": "注意事项",
    "quick.note1": "只需要配置一次，API Key 会保存在浏览器本地",
    "quick.note2": "建议在桌面或笔记本电脑上使用",
    "quick.note3": "首次启动可能需要几分钟来下载依赖",
    "quick.note4": "支持上传图片让 AI 复制图表",
    "quick.demo": "在线演示",
  },
  en: {
    // Chat Panel
    "chat.title": "Next-AI-Drawio",
    "chat.configured": "Configured",
    "chat.notConfigured": "API Not Configured",
    "chat.config": "Config",
    "chat.github": "GitHub",

    // Chat Input
    "chat.placeholder": "Describe what changes you want to make to the diagram\nor upload(paste) an image to replicate a diagram\n(Press Cmd/Ctrl + Enter to send)",
    "chat.input": "Chat input",
    "chat.clearTooltip": "Clear current conversation and diagram",
    "chat.history": "Diagram History",
    "chat.historyTooltip": "View diagram history",
    "chat.uploadImage": "Upload image",
    "chat.send": "Send",
    "chat.sending": "Sending...",

    // API Config Dialog
    "config.title": "AI Model Configuration",
    "config.provider": "AI Provider",
    "config.modelsAvailable": "models available",
    "config.apiKey": "API Key",
    "config.apiKeyStored": "Your API Key is only stored locally in your browser",
    "config.getApiKey": "Get API Key",
    "config.viewModels": "View Models",
    "config.model": "Model",
    "config.getModels": "Get Model List",
    "config.fetching": "Fetching...",
    "config.searchModels": "Search models...",
    "config.save": "Save Configuration",
    "config.cancel": "Cancel",

    // Providers
    "provider.openai": "OpenAI",
    "provider.openrouter": "OpenRouter",
    "provider.google": "Google Gemini",
    "provider.siliconflow": "SiliconFlow",

    // Messages
    "message.configureFirst": "Please configure AI provider settings first",
    "message.displayDiagram": "Successfully displayed the diagram",
    "message.editDiagram": "Successfully applied edits",
    "message.editFailed": "Failed to edit diagram",
    "message.fetchModelsUnsupported": "This provider does not support dynamic model list fetching",
    "message.fetchModelsError": "Failed to fetch model list, please check if API Key is correct",
    "message.tool": "Tool",
    "message.hideArgs": "Hide Args",
    "message.showArgs": "Show Args",
    "message.input": "Input",
    "message.diagramGenerated": "Diagram generated",
    "message.diagramEdited": "Diagram edited",
    "message.toolExecuted": "Tool executed",
    "message.diagramError": "Error generating diagram",
    "message.editError": "Error editing diagram",
    "message.toolError": "Tool error",
    "message.error": "Error",

    // Modal
    "modal.clearTitle": "Clear Everything?",
    "modal.clearDescription": "This will clear the current conversation and reset the diagram. This action cannot be undone.",
    "modal.clearAll": "Clear Everything",
    "modal.cancel": "Cancel",

    // History
    "history.title": "Diagram History",
    "history.description": "Here saved each diagram before AI modification.\nClick on a diagram to restore it",
    "history.empty": "No history available yet. Send messages to create diagram history.",
    "history.version": "Version",
    "history.close": "Close",

    // Example Panel
    "example.startConversation": "Start a conversation to generate or modify diagrams.",
    "example.uploadImages": "You can also upload images to use as references.",
    "example.tryExamples": "Try these examples:",
    "example.createAwsStyle": "Create this diagram in aws style",
    "example.replicateFlowchart": "Replicate this flowchart",
    "example.drawCat": "Draw a cat for me",

    // Quick Start
    "quick.title": "Next AI Draw.io Quick Start",
    "quick.commands": "One-Click Startup Commands",
    "quick.access": "Access the Application",
    "quick.config": "AI Configuration",
    "quick.providers": "Supported Providers",
    "quick.openai": "OpenAI (Recommended)",
    "quick.openai.keyFormat": "API Key Format",
    "quick.openai.recommendedModel": "Recommended Model",
    "quick.openrouter": "OpenRouter (Cost-Effective)",
    "quick.openrouter.dynamicModels": "Supports dynamic model list fetching",
    "quick.google": "Google Gemini",
    "quick.siliconflow": "SiliconFlow (Domestic, Cost-Effective)",
    "quick.siliconflow.dynamicSearch": "Supports dynamic model list fetching and search",
    "quick.usage": "Usage Instructions",
    "quick.step1": "When using for the first time, click the \"Config\" button in the top right corner",
    "quick.step2": "Select your preferred AI provider",
    "quick.step3": "Enter the corresponding API Key",
    "quick.step4": "(Optional) For OpenRouter and SiliconFlow, click \"Get Model List\" button to dynamically fetch latest models",
    "quick.step5": "(Optional) Enter keywords in the search box to filter model list",
    "quick.step6": "Select a model (optional, defaults to recommended model)",
    "quick.step7": "Click \"Save Configuration\"",
    "quick.step8": "Start creating and editing diagrams with natural language!",
    "quick.advanced": "Advanced Features",
    "quick.dynamicModels": "Dynamic Model Fetching",
    "quick.dynamicModels.desc": "OpenRouter and SiliconFlow providers support clicking \"Get Model List\" button to fetch the latest model list",
    "quick.modelSearch": "Model Search",
    "quick.modelSearch.desc": "Support entering keywords in the search box to filter models",
    "quick.apiLinks": "API Page Navigation",
    "quick.apiLinks.desc": "Click \"Get API Key\" or \"View Models\" links to directly navigate to the corresponding service pages",
    "quick.notes": "Notes",
    "quick.note1": "Only need to configure once, API Key is saved locally in browser",
    "quick.note2": "Recommended to use on desktop or laptop",
    "quick.note3": "First startup may take a few minutes to download dependencies",
    "quick.note4": "Support uploading images for AI to replicate diagrams",
    "quick.demo": "Online Demo",
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>("zh");

  useEffect(() => {
    const savedLanguage = localStorage.getItem("ai-draw-language") as Language;
    if (savedLanguage && (savedLanguage === "zh" || savedLanguage === "en")) {
      setLanguage(savedLanguage);
    }
  }, []);

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem("ai-draw-language", lang);
  };

  const t = (key: string): string => {
    return translations[language][key as keyof typeof translations[typeof language]] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
