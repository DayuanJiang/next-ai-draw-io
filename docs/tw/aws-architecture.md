# 用文字產生 AWS 架構圖

用文字描述您的系統，Next AI Draw.io 就會使用 draw.io `aws4` 圖形庫中的 AWS 官方圖示畫出 AWS 架構圖。它免費、開源，畫出來的是一般的 draw.io 圖表：可以手動修改，也可以匯出為 `.drawio`、`.png` 或 `.svg`。本頁介紹如何得到一份不錯的初稿，以及如何繼續完善它。

## 從描述開始

在編輯器裡描述這個系統：它由哪些部分組成，請求或資料怎樣在它們之間流動。例如：

```text
在 AWS 上畫一個無伺服器 REST API：API Gateway 在 Lambda 前面，Cognito 負責登入，DynamoDB 存資料，S3 存上傳的檔案。除了使用者之外，其他所有內容都放在一個 AWS Cloud 分組裡。
```

AI 在畫圖之前會先查閱 AWS 圖形庫，所以每個服務都會用上它真正的圖示，不會只畫成一個普通方框。

有幫助的做法：

- **寫出服務名稱。** 只說「資料庫」，可能會畫成任何一種資料庫；寫「DynamoDB」，就會用上 DynamoDB 的圖示。
- **說明哪些內容要分組。** AWS Cloud、區域、VPC、可用區域、公有子網路和私有子網路。
- **說明流向。** 例如「從左到右，從使用者到資料庫」。
- 請求或資料的方向很重要時，**要求使用動畫連接線**。

<!-- demo: generate -->

## 從已有的材料開始

- **截圖或白板照片**：上傳後，讓 AI 用 AWS 圖示重畫。
- **PDF 或設計文件**：上傳後，讓 AI 畫出其中描述的架構。
- **您的基礎架構程式碼**：透過 MCP 伺服器，Claude Code 或 Cursor 可以讀取您的 Terraform、CDK 或 CloudFormation 檔案，並畫出其中定義的內容。見[在 Claude Code 裡使用](./claude-code.md)。

```text
讀取 infra/ 裡的 Terraform 檔案，畫出它們建立的 AWS 架構，依 VPC 和子網路分組
```

## 繼續完善

- **手動移動圖形**，放到您想要的位置。AI 下次修改前會先讀取您的版面配置。
- **選取一個服務並要求修改**，例如「在它前面加一層快取」。
- **復原出錯的修改。** AI 的每次修改都是一個版本：可以在它的卡片上復原，或者還原更早的版本。

## 範例

![使用 React 和 AWS 的認證流程](../../public/auth.svg)

提示詞：「Generate authentication process using React with AWS. Use Serverless architecture.」

## 匯出

- **.drawio** 檔案的所有內容都能繼續編輯，在本應用程式或 draw.io 裡都可以。
- **PNG** 是用於簡報和文件的圖片。
- **SVG** 是放大也不會模糊的圖片。
