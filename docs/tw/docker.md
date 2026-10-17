# 使用 Docker 執行

如果您只是想在本機執行 Next AI Draw.io，最好的方式是使用 Docker。本頁介紹如何在容器裡啟動應用程式、填入 AI 服務商的設定、由伺服器提供多個模型，以及保留管理面板的設定。

## 啟動應用程式

如果您還沒有安裝 Docker，請先安裝：[取得 Docker](https://docs.docker.com/get-docker/)。

然後執行：

```bash
docker run -d -p 3000:3000 \
  -e AI_PROVIDER=openai \
  -e AI_MODEL=gpt-4o \
  -e OPENAI_API_KEY=your_api_key \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

在瀏覽器中開啟 [http://localhost:3000](http://localhost:3000)。

`-e` 選項設定的是 AI 服務商、模型和 API Key。請把它們換成您想用的 AI 服務商的設定。可用的選項見 [AI 服務商](./ai-providers.md)。

## 使用環境變數檔案

您也可以把設定寫在環境變數檔案裡。請從儲存庫裡的範本 `env.example` 開始。如果您已經 clone 了儲存庫，把它複製為 `.env`；如果沒有，從 GitHub 下載這個檔案：

```bash
# 在 clone 下來的儲存庫裡
cp env.example .env

# 沒有儲存庫時
curl -o .env https://raw.githubusercontent.com/DayuanJiang/next-ai-draw-io/main/env.example
```

在 `.env` 裡填入您的設定，再加上 `--env-file` 啟動容器：

```bash
docker run -d -p 3000:3000 --env-file .env ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

`docker run --env-file` 會把 `=` 後面的所有內容都當作值，行末的註解也算在內。`env.example` 裡有些行的末尾帶有這樣的註解：

```bash
# OPENAI_BASE_URL=https://api.openai.com/v1  # Optional: Custom OpenAI-compatible endpoint
```

當您刪掉行首的 `#` 啟用這樣的一行時，請把值後面的註解也刪掉：

```bash
OPENAI_BASE_URL=https://api.openai.com/v1
```

Docker Compose 的 `env_file` 會自動移除這類註解。

## 由伺服器提供多個模型

您可以把 `ai-models.json` 檔案掛載到容器裡。有了這個檔案，伺服器就能提供多個模型，使用者的 API Key 也不會暴露。把檔案掛載到 `/app/ai-models.json`：

```bash
docker run -d -p 3000:3000 \
  -e OPENAI_API_KEY=your_api_key \
  -v $(pwd)/ai-models.json:/app/ai-models.json:ro \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

如果想把檔案放在容器裡的其他路徑，請把 `AI_MODELS_CONFIG_PATH` 設為這個路徑：

```bash
docker run -d -p 3000:3000 \
  -e OPENAI_API_KEY=your_api_key \
  -e AI_MODELS_CONFIG_PATH=/config/ai-models.json \
  -v $(pwd)/ai-models.json:/config/ai-models.json:ro \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

## 保留管理面板的設定

[管理面板](./admin-panel.md)把設定儲存在容器裡的 `/app/data` 目錄中。儲存庫裡的 `docker-compose.yml` 會把 `./data` 目錄掛載到這裡（`./data:/app/data`），所以更換容器後，設定仍然保留。使用 `docker run` 時，請加上同樣的掛載：

```bash
docker run -d -p 3000:3000 --env-file .env \
  -v $(pwd)/data:/app/data \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

容器裡的應用程式以使用者 `nextjs`（使用者 ID 1001）的身分執行，這個使用者必須能寫入這個目錄。在 Linux 上，如果 `./data` 不存在，Docker 會建立它，擁有者是 root，管理面板就會變成唯讀。請在啟動容器之前，先建立這個目錄並設定正確的擁有者。在您執行 `docker run` 或 `docker compose up` 的目錄裡執行：

```bash
mkdir -p data
sudo chown 1001:1001 data
```

## 無法連上 embed.diagrams.net 時

應用程式不需要連線到 embed.diagrams.net。ghcr.io 上的映像在建置時沒有設定 `NEXT_PUBLIC_DRAWIO_BASE_URL`，用儲存庫裡的 `docker-compose.yml` 建置的映像也一樣。所以應用程式從 `/drawio` 提供內建的 draw.io，瀏覽器不會連線到 embed.diagrams.net。只有建置時傳入建置引數 `NEXT_PUBLIC_DRAWIO_BASE_URL=https://embed.diagrams.net` 的映像，才會從那裡載入 draw.io。

如果要在不能連網的環境裡執行應用程式，請參閱[在離線環境或內網中執行](./offline-deployment.md)。
