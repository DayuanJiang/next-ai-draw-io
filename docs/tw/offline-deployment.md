# 在離線環境或內網中執行

Next AI Draw.io 可以在不能連上網際網路的網路裡執行，例如公司內網。本頁介紹如何在這種環境裡建置和執行它，以及在需要時如何使用獨立的 draw.io 伺服器。

## 應用程式如何離線運作

Next AI Draw.io 內建一份 draw.io。`npm run build` 會把 draw.io 的發行檔下載到 `public/drawio`，只下載一次；Docker 建置也是這樣。之後應用程式從 `/drawio` 提供這份副本。

使用應用程式時，瀏覽器不會連線到 `embed.diagrams.net`。所以只要建置時能連網，應用程式就能在離線網路或內網裡使用。

## 使用 Docker Compose 執行

1. 將儲存庫 clone 到本機，並在 `.env` 檔案中定義您的 API Key。
2. 執行 `docker compose up -d`。它會使用儲存庫裡的 `docker-compose.yml`。
3. 開啟 `http://localhost:3000`。

您不需要獨立的 draw.io 容器。

## 在不能連網的機器上建置

建置時會從 [draw.io 發行頁面](https://github.com/jgraph/drawio/releases) 下載 `draw.war`（約 50 MB）。如果建置用的機器連不上 GitHub，請選擇下面兩種做法之一：

- **手動放入 draw.io。** 在另一台機器上，下載 `packages/mcp-server/src/drawio-version.json` 裡寫明的那個版本的 `draw.war`。把它解壓縮到 `public/drawio`，然後刪掉其中的 `WEB-INF` 和 `META-INF` 資料夾。再把版本號碼（例如 `v32.0.2`）寫進 `public/drawio/.version`。建置時就會使用這份副本。
- **在別處建置映像。** 在能連網的機器上建置映像，再把映像複製到離線網路裡。

## 插入其他網站的圖片

內建的 draw.io 是一組靜態檔案（伺服器原樣傳送的檔案）。其中沒有圖片代理（`/drawio/proxy`）。圖片代理是 draw.io 伺服器的一部分，負責替 draw.io 取得其他網站的圖片。

用網址插入的其他網站的圖片，仍然能在畫布上顯示。匯出的 PNG、SVG 圖片和版本縮圖裡不會有它，因為 draw.io 要透過這個代理去取這類圖片。

這類圖片請改用檔案插入，draw.io 會把它儲存在圖表裡。

## 使用獨立的 draw.io 伺服器

這一步並非必要。您仍然可以讓應用程式使用別處的 draw.io，例如 `jgraph/drawio` 映像。把 `NEXT_PUBLIC_DRAWIO_BASE_URL` 設為它的位址。這個變數在建置應用程式時讀取，所以要作為建置引數傳入：

```yaml
services:
  drawio:
    image: jgraph/drawio:latest
    ports: ["8080:8080"]
  next-ai-draw-io:
    build:
      context: .
      args:
        - NEXT_PUBLIC_DRAWIO_BASE_URL=http://localhost:8080
    ports: ["3000:3000"]
    env_file: .env
    volumes:
      - ./data:/app/data
    depends_on: [drawio]
```

`volumes` 這一項把您在[管理面板](./admin-panel.md)裡儲存的設定（`data/settings.json`）放在容器之外，所以更換容器後，這些設定仍然保留。

使用外部 draw.io 時，應用程式改用 draw.io 自己的工具列，以下功能無法使用：

- 框出 AI 改過的圖形
- 針對選取的圖形提問
- 應用程式自己的畫布工具列
- 用 Ctrl+Z 復原 AI 的修改

瀏覽器不允許頁面控制來自其他來源（主機名稱、連接埠或通訊協定不同）的編輯器。

**`NEXT_PUBLIC_DRAWIO_BASE_URL` 必須是使用者瀏覽器能連上的位址。**

| draw.io 執行在哪裡 | 值 |
|---|---|
| 您自己的電腦（localhost） | `http://localhost:8080` |
| 遠端伺服器 | `http://YOUR_SERVER_IP:8080` |

**不要使用** Docker 內部的名稱，例如 `http://drawio:8080`。這些是容器之間互相連線用的名稱，瀏覽器無法透過它們找到伺服器。
