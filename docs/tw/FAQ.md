# 常見問題解答

這一頁列出了使用 Next AI Draw.io 時常遇到的問題。每個問題都說明您會看到什麼、為什麼會這樣，以及該怎麼做。

## 匯出 PDF 後沒有反應

應用程式自己的「匯出」對話方塊可以儲存 draw.io 檔案、PNG 圖片、SVG 圖片或可編輯的 SVG。PDF 要從 draw.io 自己的選單匯出：點選畫布左上角的 ☰，選擇 **匯出為**，再選擇 **PDF**。接下來您會看到什麼，取決於應用程式用的是哪一個 draw.io。

**應用程式內建的 draw.io。** 網頁版、Docker 映像和桌面版應用程式都用它，除非建置應用程式時設定了 `NEXT_PUBLIC_DRAWIO_BASE_URL`。這份 draw.io 透過列印來產生 PDF。它會開啟 PDF 對話方塊，點選其中的 **列印**，會開啟瀏覽器或系統的列印對話方塊。請在列印對話方塊裡選擇儲存為 PDF，例如 Chrome 的 **另存為 PDF**，或 Windows 的 **Microsoft Print to PDF**。

**外部的 draw.io**，也就是用 `NEXT_PUBLIC_DRAWIO_BASE_URL` 設定的 draw.io，例如 `https://embed.diagrams.net`。頁面會轉到 `convert.diagrams.net/node/export`，然後就沒有反應了。這種 draw.io 會把圖表傳送到 `convert.diagrams.net` 上的轉換服務來產生 PDF，而在應用程式裡，這個下載會失敗。請改用 draw.io 選單裡的 **列印**，然後在列印對話方塊裡儲存為 PDF。您也可以移除 `NEXT_PUBLIC_DRAWIO_BASE_URL` 重新建置應用程式，讓它使用內建的 draw.io。

相關的 GitHub Issue：#539、#125

## 在離線或內網環境裡，瀏覽器連不上 embed.diagrams.net

在內網環境裡，瀏覽器顯示「找不到 embed.diagrams.net 的伺服器 IP 位址」。

應用程式內建一份 draw.io，從 `/drawio` 提供，所以瀏覽器不需要連線到 `embed.diagrams.net`。現在的 Dockerfile 把 `NEXT_PUBLIC_DRAWIO_BASE_URL` 留空，所以用它建置的映像都使用這份 draw.io，官方發布的映像也一樣。只有用 `NEXT_PUBLIC_DRAWIO_BASE_URL=https://embed.diagrams.net` 建置的映像，才會從 `embed.diagrams.net` 載入 draw.io。v0.5.0 之前的 Dockerfile 預設使用這個值。

如果您看到這個錯誤，請使用 v0.5.0 或更新版本的映像，或者移除這個建置引數，重新建置您的映像。Dockerfile 不需要修改。建置時要下載 draw.io，所以如果要在內網使用，請在能連網的機器上建置映像，再把映像傳到內網。詳見[在不能連網的機器上建置](./offline-deployment.md#在不能連網的機器上建置)。

`NEXT_PUBLIC_*` 環境變數是**建置時**變數，會被打包進 JS 程式碼。**在執行時設定它們不會生效。**

如果仍想使用獨立的 draw.io 伺服器，請在建置時透過 `args` 傳入它的位址：

```yaml
# docker-compose.yml
services:
  drawio:
    image: jgraph/drawio:latest
    ports: ["8080:8080"]
  next-ai-draw-io:
    build:
      context: .
      args:
        - NEXT_PUBLIC_DRAWIO_BASE_URL=http://您的伺服器IP:8080/
    ports: ["3000:3000"]
    env_file: .env
```

相關的 GitHub Issue：#295、#317

## 自架的模型只思考，不畫圖

在本機部署的模型（例如 Qwen、LiteLLM）只輸出思考過程，不產生圖表。

可能的原因有兩個：

- **模型太小。** 小模型很難正確遵循工具呼叫的指令。請使用 32B 或更多參數的模型。
- **沒有開啟工具呼叫。** 模型要透過工具呼叫來畫圖，所以執行模型的服務需要設定工具呼叫功能。

請在執行模型的服務裡開啟工具呼叫。以 vLLM 為例：

```bash
python -m vllm.entrypoints.openai.api_server \
    --model Qwen/Qwen3-32B \
    --enable-auto-tool-choice \
    --tool-call-parser hermes
```

相關的 GitHub Issue：#269、#75

## 模型無法讀取您上傳的圖片

傳送圖片後，您會看到下面其中一種情況：

- 對話裡顯示「這個模型不支援圖片輸入。」，下面是服務商回傳的錯誤。
- 模型的回答像是沒有收到圖片，例如說沒有提供圖片。

您選的模型不支援視覺功能，也就是不能讀取圖片，例如 Kimi K2、DeepSeek 和 Qwen 的文字模型。應用程式會把圖片傳給您選的模型，由服務商判斷這個模型能不能接收圖片。服務商拒絕圖片時，應用程式會顯示上面的提示。有些服務商會悄悄丟棄圖片，模型就會在沒有圖片的情況下回答。

解決方法：

- 在模型設定裡選擇能讀取圖片的模型，例如 GPT-5.2、Claude Sonnet 4.5 或 Gemini 3 Pro。
- 其他模型請檢視服務商的模型頁面，確認它是否支援圖片輸入。模型名稱裡帶有 `vision` 或 `vl` 的模型通常支援。
- 如果您選的模型能讀取圖片，圖片卻仍被拒絕，請更新到 v0.5.0 或更新版本。舊版本會根據模型名稱猜測模型能否讀取圖片，有時會猜錯。

相關的 GitHub Issue：#324、#421、#469、#874
