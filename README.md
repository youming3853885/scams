# 網站詐騙檢測工具

此專案是一個功能完整的網站詐騙檢測工具，使用AI技術協助使用者識別可能的詐騙網站並視覺化呈現詐騙風險。

## 功能概述

- 使用者可貼上想要查詢的網站URL
- 系統會**抓取並顯示該網站的實時截圖**（使用Puppeteer）
- **使用OpenAI API分析網站內容**，識別可能的詐騙元素
- 以**紅色框框標示可疑的詐騙內容區域**
- 顯示詐騙可能性百分比的圓餅圖
- 提供量化的詐騙風險分數和詳細分析
- 支持HTTPS安全連接
- 內置快取系統，提高重複分析的效率
- 自動隊列管理，控制並發請求數量
- 完整的日誌系統，方便排錯和監控
- 詳細的安全建議和風險指標分析

## 目前功能完成度

- ✅ **前端頁面開發**：完整實現了用戶界面和交互邏輯
- ✅ **網站截圖功能**：使用Puppeteer實現網站截圖
- ✅ **AI分析功能**：通過OpenAI API進行網站內容詐騙分析
- ✅ **風險視覺化**：實現了風險評分和圖表展示
- ✅ **可疑區域標記**：能夠在截圖上標示潛在危險區域
- ✅ **API配額處理**：當API配額不足時提供模擬數據顯示
- ⚠️ **用戶認證系統**：尚未實現
- ⚠️ **歷史掃描記錄**：尚未實現
- ⚠️ **詐騙網站資料庫**：尚未實現
- ⚠️ **移動端優化**：基本實現，但需進一步完善

## 專案結構

```
網站詐騙檢測工具/
├── index.html         # 前端頁面
├── styles.css         # 樣式表
├── script.js          # 前端JavaScript
├── server.js          # 後端Node.js服務
├── .env               # 環境變數配置
├── .env.example       # 環境變數示例
├── package.json       # 專案依賴
├── logs/              # 日誌文件目錄
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
- **Winston**: 強大的日誌系統
- **Express Rate Limit**: API請求速率控制
- **CORS**: 處理跨域請求

## 系統要求

- Node.js 18.0.0或更高版本
- 有效的OpenAI API密鑰
- 如啟用HTTPS，需要有效的SSL證書

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
   - 在`.env`文件中配置以下主要設置:

```
# 服務器設置
SERVER_PORT=3000                # 服務器端口
ENABLE_HTTPS=false              # 是否啟用HTTPS
SSL_CERT_PATH=./certs/cert.pem  # SSL證書路徑
SSL_KEY_PATH=./certs/key.pem    # SSL私鑰路徑

# API密鑰
OPENAI_API_KEY=your_api_key_here  # OpenAI API密鑰
OPENAI_MODEL=gpt-4-turbo          # 使用的OpenAI模型

# 代理設置（如需通過代理訪問API）
USE_PROXY=false
PROXY_SERVER=http://proxy.example.com:8080

# 安全設置
MAX_URLS_PER_DAY=100            # 每日最大掃描URL數量
MAX_CONCURRENT_REQUESTS=5       # 最大並發請求數

# 日誌設置
LOG_LEVEL=info                  # 日誌級別(debug/info/warn/error)
LOG_FILE_PATH=./logs/app.log    # 日誌文件路徑
CONSOLE_LOGGING=true            # 是否在控制台輸出日誌

# 快取設置
ENABLE_CACHE=true               # 是否啟用結果快取
CACHE_TTL=3600                  # 快取有效期（秒）
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

## 環境變數詳細說明

### 服務器配置
- `SERVER_PORT`: 服務器監聽端口
- `ENABLE_HTTPS`: 設置為`true`啟用HTTPS
- `SSL_CERT_PATH`: SSL證書文件路徑
- `SSL_KEY_PATH`: SSL私鑰文件路徑

### API配置
- `OPENAI_API_KEY`: OpenAI API密鑰
- `OPENAI_MODEL`: 使用的AI模型，默認為`gpt-4-turbo`
- `API_TIMEOUT`: API請求超時時間（毫秒）

### 代理配置
- `USE_PROXY`: 是否使用代理服務器
- `PROXY_SERVER`: 代理服務器地址
- `PROXY_AUTH_USERNAME`: 代理服務器認證用戶名
- `PROXY_AUTH_PASSWORD`: 代理服務器認證密碼

### 安全配置
- `MAX_URLS_PER_DAY`: 每天最大允許的URL掃描數量
- `RATE_LIMIT_WINDOW_MS`: 速率限制窗口時間（毫秒）
- `MAX_CONCURRENT_REQUESTS`: 最大同時處理的請求數
- `CORS_ALLOWED_ORIGINS`: 允許的CORS源，多個用逗號分隔

### 網頁抓取配置
- `PAGE_LOAD_TIMEOUT`: 頁面加載超時時間（毫秒）
- `ENABLE_JAVASCRIPT`: 是否啟用JavaScript執行
- `BROWSER_WIDTH`: 瀏覽器視窗寬度
- `BROWSER_HEIGHT`: 瀏覽器視窗高度

### 日誌配置
- `LOG_LEVEL`: 日誌級別(debug/info/warn/error)
- `LOG_FILE_PATH`: 日誌文件保存路徑
- `LOG_RETENTION_DAYS`: 日誌保留天數
- `CONSOLE_LOGGING`: 是否在控制台輸出日誌

### 快取配置
- `ENABLE_CACHE`: 是否啟用結果快取
- `CACHE_TTL`: 快取有效期（秒）
- `MAX_CACHE_ITEMS`: 最大快取項目數量

## 安全注意事項

- 所有分析均在服務器端進行，不會在用戶瀏覽器中直接加載可疑網站
- 本工具僅提供風險評估，最終判斷應由用戶自行決定
- 請不要使用此工具進行非法活動或惡意測試
- 建議在生產環境中啟用HTTPS和適當的API速率限制

## 部署到生產環境

### 系統準備
1. 確保服務器有足夠的內存（推薦至少2GB RAM）
2. 安裝Node.js 18+和npm
3. 如需截圖功能，確保安裝了Puppeteer依賴庫

### 部署到Heroku:

```
heroku create
git push heroku main
heroku config:set OPENAI_API_KEY=your_api_key_here
heroku config:set ENABLE_HTTPS=true
```

### 部署到其他雲服務:

1. 確保設置了正確的環境變數
2. 根據雲服務的要求調整端口設置
3. 配置SSL證書以確保安全連接
4. 考慮使用容器化部署（如Docker）以確保環境一致性

### Docker部署:
```
docker build -t scam-detector .
docker run -p 3000:3000 --env-file .env scam-detector
```

## 開發者指南

### 本地開發

使用開發模式運行服務器，自動重啟:
```
npm run dev
```

### 核心模塊說明

- **服務器初始化**: 在`server.js`中設置Express應用和中間件
- **網站數據獲取**: `getWebsiteData()`函數使用Puppeteer獲取網站截圖和內容
- **詐騙風險分析**: `analyzeFraudRisk()`函數調用OpenAI API分析內容
- **可疑區域識別**: `identifySuspiciousAreas()`函數識別需要在截圖上標記的區域
- **請求隊列管理**: 控制並發請求數量，防止服務器過載
- **快取系統**: 減少對相同URL的重複分析，提高響應速度

### 常見問題排除

- **連接超時**: 檢查網絡連接和目標網站可訪問性
- **API錯誤**: 確認OpenAI API密鑰有效且未超出配額
- **內存問題**: 調整`MAX_CONCURRENT_REQUESTS`以限制同時進行的分析
- **截圖失敗**: 某些網站可能會阻止Puppeteer，試著調整用戶代理或使用代理服務器

## 性能優化建議

- 在高流量場景下考慮使用Redis快取代替內存快取
- 對於需要長時間處理的請求，考慮實現異步處理隊列（如使用Redis或RabbitMQ）
- 為提高可用性，考慮實現水平擴展和負載均衡

## 未來發展路線

### 近期開發計劃 (1-3個月)
- 實現用戶帳戶系統和身份驗證
- 添加掃描歷史記錄功能
- 優化移動端體驗
- 添加多語言支持

### 中期開發計劃 (3-6個月)
- 開發瀏覽器擴展，提供實時防護
- 建立詐騙網站資料庫
- 添加社區舉報功能
- 改進AI模型，提高分析準確率

### 長期發展方向 (6個月以上)
- 開發移動應用程序版本
- 構建開發者API平台
- 建立付費訂閱模式
- 開發企業安全解決方案

## 貢獻

歡迎貢獻代碼、報告問題或提出改進建議。請提交pull request或創建issue。

## 許可證

MIT License 