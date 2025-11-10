"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Settings, Search, ExternalLink, Loader2, Download } from "lucide-react";
import { useLanguage } from "@/contexts/language-context";

interface ApiConfig {
  provider: string;
  apiKey: string;
  model?: string;
}

interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  pricing?: {
    prompt: number;
    completion: number;
  };
}

const providers = [
  {
    id: "openai",
    name: "OpenAI",
    models: ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"],
    defaultModel: "gpt-4",
    placeholder: "sk-...",
    apiUrl: "https://platform.openai.com/api-keys",
    modelsUrl: "https://platform.openai.com/docs/models",
    getModelsApi: null,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    models: [
      "openai/gpt-4o",
      "openai/gpt-4-turbo",
      "anthropic/claude-3.5-sonnet",
      "moonshotai/kimi-k2:free",
    ],
    defaultModel: "openai/gpt-4o",
    placeholder: "sk-or-...",
    apiUrl: "https://openrouter.ai/keys",
    modelsUrl: "https://openrouter.ai/models",
    getModelsApi: "https://openrouter.ai/api/v1/models",
  },
  {
    id: "google",
    name: "Google Gemini",
    models: ["gemini-1.5-pro", "gemini-1.5-flash"],
    defaultModel: "gemini-1.5-pro",
    placeholder: "AIza...",
    apiUrl: "https://aistudio.google.com/app/apikey",
    modelsUrl: "https://ai.google.dev/gemini-api/docs/models/gemini",
    getModelsApi: null,
  },
  {
    id: "siliconflow",
    name: "SiliconFlow (硅基流动)",
    models: [
      "Qwen/Qwen2.5-72B-Instruct",
      "Qwen/Qwen2.5-Coder-32B-Instruct",
      "deepseek-chat",
      "deepseek-coder",
    ],
    defaultModel: "Qwen/Qwen2.5-72B-Instruct",
    placeholder: "sk-...",
    apiUrl: "https://cloud.siliconflow.cn/me/account/ak",
    modelsUrl: "https://cloud.siliconflow.cn/models",
    getModelsApi: "https://api.siliconflow.cn/v1/models",
  },
];

export function ApiConfigDialog() {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<ApiConfig>({
    provider: "openai",
    apiKey: "",
    model: "gpt-4",
  });

  // Add state for model fetching and search
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState("");

  // Load config from localStorage on mount
  useEffect(() => {
    const savedConfig = localStorage.getItem("ai-draw-config");
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        setConfig(parsed);
      } catch (error) {
        console.error("Failed to parse saved config:", error);
      }
    }
  }, []);

  const selectedProvider = providers.find(p => p.id === config.provider);

  // Function to fetch models from API
  const fetchModels = async () => {
    if (!selectedProvider?.getModelsApi) {
      alert(t("message.fetchModelsUnsupported"));
      return;
    }

    setIsLoadingModels(true);
    try {
      const response = await fetch(selectedProvider.getModelsApi, {
        headers: {
          "Authorization": `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = await response.json();
      const models = data.data?.map((model: any) => ({
        id: model.id,
        name: model.name || model.id,
        description: model.description,
        context_length: model.context_length,
        pricing: model.pricing,
      })) || [];

      setAvailableModels(models);
    } catch (error) {
      console.error("Error fetching models:", error);
      alert(t("message.fetchModelsError"));
    } finally {
      setIsLoadingModels(false);
    }
  };

  // Filter models based on search query
  const filteredModels = availableModels.filter(model =>
    model.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
    (model.description?.toLowerCase().includes(modelSearchQuery.toLowerCase()) ?? false)
  );

  // Use filtered models if available, otherwise use default models
  const displayModels = availableModels.length > 0
    ? filteredModels.map(m => m.id)
    : selectedProvider?.models || [];

  const handleSave = () => {
    // Save to localStorage
    localStorage.setItem("ai-draw-config", JSON.stringify(config));
    setIsOpen(false);
    // Reload to apply new config
    window.location.reload();
  };

  const handleProviderChange = (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (provider) {
      setConfig({
        ...config,
        provider: providerId,
        model: provider.defaultModel,
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <Settings className="w-4 h-4" />
          {t("chat.config")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("config.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Provider Selection */}
          <div>
            <label className="text-sm font-medium mb-2 block">{t("config.provider")}</label>
            <div className="grid grid-cols-1 gap-2">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  onClick={() => handleProviderChange(provider.id)}
                  className={`p-3 text-left rounded-lg border-2 transition-colors ${
                    config.provider === provider.id
                      ? "border-primary bg-primary/5"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="font-medium">{provider.name}</div>
                  <div className="text-sm text-gray-500 mt-1">
                    {provider.models.length} {t("config.modelsAvailable")}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <label className="text-sm font-medium mb-2 block">
              API Key ({selectedProvider?.name})
            </label>
            <Input
              type="password"
              placeholder={selectedProvider?.placeholder}
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
            />
            <p className="text-xs text-gray-500">
              {t("config.apiKeyStored")}
            </p>
            {selectedProvider?.apiUrl && (
              <a
                href={selectedProvider.apiUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                {t("config.getApiKey")}
              </a>
            )}
            {selectedProvider?.modelsUrl && (
              <a
                href={selectedProvider.modelsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                {t("config.viewModels")}
              </a>
            )}
          </div>

          {/* Model Selection */}
          {selectedProvider && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">{t("config.model")}</label>
                {selectedProvider.getModelsApi && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={fetchModels}
                    disabled={isLoadingModels || !config.apiKey.trim()}
                    className="h-8 text-xs"
                  >
                    {isLoadingModels ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        {t("config.fetching")}
                      </>
                    ) : (
                      <>
                        <Download className="w-3 h-3 mr-1" />
                        {t("config.getModels")}
                      </>
                    )}
                  </Button>
                )}
              </div>

              {selectedProvider.getModelsApi && (
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder={t("config.searchModels")}
                    value={modelSearchQuery}
                    onChange={(e) => setModelSearchQuery(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>
              )}

              <select
                value={config.model}
                onChange={(e) => setConfig({ ...config, model: e.target.value })}
                className="w-full p-2 border rounded-lg"
              >
                {displayModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Save Button */}
          <div className="flex gap-2 pt-4">
            <Button
              onClick={handleSave}
              disabled={!config.apiKey.trim()}
              className="flex-1"
            >
              {t("config.save")}
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
            >
              {t("config.cancel")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}