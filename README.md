# 網站詐騙檢測工具

此專案是一個功能完整的網站詐騙檢測工具，使用AI技術協助使用者識別可能的詐騙網站並視覺化呈現詐騙風險。

## 功能概述

- 使用者可貼上想要查詢的網站URL
- 系統會**抓取並顯示該網站的實時截圖**（使用Puppeteer）
- **使用OpenAI API分析網站內容**，識別可能的詐騙元素
- 以**紅色框框標示可疑的詐騙內容區域**
- 顯示詐騙可能性百分比的圓餅圖
- 提供量化的詐騙風險分數和詳細分析

## 專案結構

```
網站詐騙檢測工具/
├── index.html         # 前端頁面
├── styles.css         # 樣式表
├── script.js          # 前端JavaScript
├── server.js          # 後端Node.js服務
├── .env               # 環境變數配置
├── package.json       # 專案依賴
└── README.md          # 專案說明
```

## 技術架構

### 前端
- **HTML/CSS/JavaScript**: 建立用戶界面和交互
- **Chart.js**: 用於風險圓餅圖可視化
- **Font Awesome**: 提供UI圖標

### 後端
- **Node.js + Express**: 構建RESTful API服務
- **Puppeteer**: 用於網站截圖和內容抓取
- **OpenAI API**: 分析網站內容檢測詐騙風險
- **CORS**: 處理跨域請求

## 系統要求

- Node.js 18.0.0或更高版本
- 有效的OpenAI API密鑰

## 安裝與配置

1. 克隆此專案:
```
git clone [repository-url]
cd website-scam-detector
```

2. 安裝依賴:
```
npm install
```

3. 配置環境變數:
   - 複製`.env.example`文件為`.env`
   - 在`.env`文件中設置您的OpenAI API密鑰:
   ```
   OPENAI_API_KEY=your_api_key_here
   ```

4. 運行應用程序:
```
npm start
```

5. 訪問應用程序:
   - 打開瀏覽器，輸入 `http://localhost:3000`

## 使用方法

1. 進入網站首頁
2. 在搜索欄中輸入要檢測的完整網址，確保包含`http://`或`https://`
3. 點擊「立即檢測」按鈕
4. 等待系統分析完成，這可能需要幾秒鐘
5. 查看詳細分析結果:
   - 風險評分和風險圓餅圖
   - 網站截圖，帶有標記的可疑區域
   - 詐騙指標列表
6. 點擊風險分數卡片可查看更詳細的分析和安全建議

## 安全注意事項

- 所有分析均在服務器端進行，不會在用戶瀏覽器中直接加載可疑網站
- 本工具僅提供風險評估，最終判斷應由用戶自行決定
- 請不要使用此工具進行非法活動或惡意測試

## 部署到生產環境

### 部署到Heroku:

```
heroku create
git push heroku main
heroku config:set OPENAI_API_KEY=your_api_key_here
```

### 部署到其他雲服務:

1. 確保設置了正確的環境變數
2. 根據雲服務的要求調整端口設置
3. 配置SSL證書以確保安全連接

## 開發者指南

### 本地開發

使用開發模式運行服務器，自動重啟:
```
npm run dev
```

### 擴展功能

- 詐騙檢測邏輯位於 `server.js` 中的 `analyzeFraudRisk` 函數
- 標記區域識別邏輯位於 `identifySuspiciousAreas` 函數
- 前端處理和UI邏輯位於 `script.js`

## 技術限制

- OpenAI API調用需要網絡連接和API密鑰
- 大型網站的截圖和分析可能需要更長時間
- 某些網站可能會阻止Puppeteer訪問或截圖

## 貢獻

歡迎貢獻代碼、報告問題或提出改進建議。

## 許可證

MIT License 