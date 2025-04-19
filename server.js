const express = require('express');
const cors = require('cors');
const axios = require('axios');
const puppeteer = require('puppeteer');
const { Configuration, OpenAIApi } = require('openai');
const path = require('path');
const fs = require('fs');
const winston = require('winston');
const rateLimit = require('express-rate-limit');
const https = require('https');
const { getBrowser } = require('./puppeteer.config');
require('dotenv').config();

// 服務器配置
const PORT = process.env.SERVER_PORT || 3000;
const ENABLE_HTTPS = process.env.ENABLE_HTTPS === 'true';
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || './certs/cert.pem';
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || './certs/key.pem';

// API配置
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4-turbo';
const API_TIMEOUT = parseInt(process.env.API_TIMEOUT || '60000');

// 代理配置
const USE_PROXY = process.env.USE_PROXY === 'true';
const PROXY_SERVER = process.env.PROXY_SERVER || '';
const PROXY_AUTH_USERNAME = process.env.PROXY_AUTH_USERNAME || '';
const PROXY_AUTH_PASSWORD = process.env.PROXY_AUTH_PASSWORD || '';

// 安全配置
const MAX_URLS_PER_DAY = parseInt(process.env.MAX_URLS_PER_DAY || '100');
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '86400000');
const MAX_CONCURRENT_REQUESTS = parseInt(process.env.MAX_CONCURRENT_REQUESTS || '5');
const CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];

// 網頁抓取配置
const PAGE_LOAD_TIMEOUT = parseInt(process.env.PAGE_LOAD_TIMEOUT || '30000');
const ENABLE_JAVASCRIPT = process.env.ENABLE_JAVASCRIPT !== 'false';
const BROWSER_WIDTH = parseInt(process.env.BROWSER_WIDTH || '1280');
const BROWSER_HEIGHT = parseInt(process.env.BROWSER_HEIGHT || '800');

// 日誌配置
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_FILE_PATH = process.env.LOG_FILE_PATH || './logs/app.log';
const LOG_RETENTION_DAYS = parseInt(process.env.LOG_RETENTION_DAYS || '30');
const CONSOLE_LOGGING = process.env.CONSOLE_LOGGING !== 'false';

// 快取配置
const ENABLE_CACHE = process.env.ENABLE_CACHE === 'true';
const CACHE_TTL = parseInt(process.env.CACHE_TTL || '3600');
const MAX_CACHE_ITEMS = parseInt(process.env.MAX_CACHE_ITEMS || '1000');

// 初始化Express應用
const app = express();

// 設置CORS
app.use(cors({
  origin: CORS_ALLOWED_ORIGINS,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '.')));

// 初始化OpenAI API客戶端
const openai = new OpenAIApi(new Configuration({
  apiKey: OPENAI_API_KEY,
}));

// 簡單的內存快取實現
let cache = {};
if (ENABLE_CACHE) {
  // 清理過期快取項目的定時任務
  setInterval(() => {
    const now = Date.now();
    Object.keys(cache).forEach(key => {
      if (cache[key].expiry < now) {
        delete cache[key];
      }
    });
  }, 60000); // 每分鐘清理一次
}

// 設置並發請求隊列
let activeRequests = 0;
const requestQueue = [];

// 添加速率限制
const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: MAX_URLS_PER_DAY,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '已超過今日掃描限制，請明天再試。' }
});

// 將速率限制應用到掃描API
app.use('/api/scan', apiLimiter);

// 設置日誌系統
const logDir = path.dirname(LOG_FILE_PATH);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logTransports = [];
if (CONSOLE_LOGGING) {
  logTransports.push(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

logTransports.push(new winston.transports.File({ 
  filename: LOG_FILE_PATH,
  maxFiles: LOG_RETENTION_DAYS,
  maxsize: 5242880, // 5MB
  tailable: true
}));

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: logTransports
});

// 處理根路徑請求
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 處理健康檢查請求
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 掃描網站 API 端點
app.post('/api/scan', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: '請提供有效的網址' });
    }

    // 檢查快取
    if (ENABLE_CACHE) {
      const cacheKey = `scan:${url}`;
      if (cache[cacheKey] && cache[cacheKey].expiry > Date.now()) {
        logger.info(`從快取返回分析: ${url}`);
        return res.json(cache[cacheKey].data);
      }
    }

    // 檢查並發請求數
    if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
      // 將請求添加到隊列中
      return new Promise((resolve, reject) => {
        requestQueue.push(() => {
          processScanRequest(url, req, res)
            .then(resolve)
            .catch(reject);
        });
      });
    }

    await processScanRequest(url, req, res);

  } catch (error) {
    logger.error(`掃描失敗: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: '掃描過程中發生錯誤', details: error.message });
  }
});

// 處理單個掃描請求
async function processScanRequest(url, req, res) {
  activeRequests++;
  try {
    logger.info(`開始掃描網址: ${url}`);

    // 1. 獲取網站截圖和內容
    const { screenshot, content, metadata } = await getWebsiteData(url);
    
    // 2. 分析網站詐騙風險
    const analysis = await analyzeFraudRisk(url, content, metadata);
    
    // 3. 獲取截圖上需要標記的區域
    const markers = await identifySuspiciousAreas(screenshot, content, analysis);
    
    // 4. 構建並返回結果
    const result = {
      url,
      screenshot: screenshot ? `data:image/jpeg;base64,${screenshot}` : null,
      analysis,
      markers,
      scanTime: new Date().toISOString()
    };
    
    // 儲存到快取
    if (ENABLE_CACHE) {
      const cacheKey = `scan:${url}`;
      cache[cacheKey] = {
        data: result,
        expiry: Date.now() + (CACHE_TTL * 1000)
      };
      
      // 檢查快取大小
      if (Object.keys(cache).length > MAX_CACHE_ITEMS) {
        // 移除最舊的項目
        const oldestKey = Object.keys(cache).sort((a, b) => 
          cache[a].expiry - cache[b].expiry
        )[0];
        if (oldestKey) delete cache[oldestKey];
      }
    }
    
    logger.info(`掃描完成: ${url}, 風險分數: ${analysis.riskScore}`);
    res.json(result);
  } catch (error) {
    logger.error(`掃描失敗: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: '掃描過程中發生錯誤', details: error.message });
  } finally {
    activeRequests--;
    
    // 檢查隊列中是否有等待的請求
    if (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT_REQUESTS) {
      const nextRequest = requestQueue.shift();
      nextRequest();
    }
  }
}

// 獲取網站數據（截圖和內容）
async function getWebsiteData(url) {
  let browser = null;
  let page = null;
  try {
    logger.info(`正在開始分析網站: ${url}`);
    
    // 使用配置的 getBrowser 函數而不是直接調用 puppeteer.launch
    browser = await getBrowser();

    logger.debug('Puppeteer 啟動成功，創建新頁面...');
    page = await browser.newPage();
    
    // 設置頁面視窗大小
    await page.setViewport({ width: BROWSER_WIDTH, height: BROWSER_HEIGHT });
    
    // 設置用戶代理
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // 如果禁用JavaScript
    if (!ENABLE_JAVASCRIPT) {
      await page.setJavaScriptEnabled(false);
    }
    
    // 提高導航超時
    logger.debug(`正在導航到 ${url}...`);
    await page.goto(url, { 
      waitUntil: 'networkidle2', 
      timeout: PAGE_LOAD_TIMEOUT 
    });
    logger.debug('頁面導航完成');
    
    // 獲取截圖
    const screenshot = await page.screenshot({ 
      type: 'jpeg',
      quality: 80, 
      fullPage: true 
    });
    
    // 提取網頁內容（文本和DOM結構）
    const content = await page.evaluate(() => {
      // 獲取頁面文本內容
      const bodyText = document.body.innerText;
      
      // 獲取所有表單
      const forms = Array.from(document.querySelectorAll('form')).map(form => ({
        action: form.action,
        method: form.method,
        inputs: Array.from(form.querySelectorAll('input')).map(input => ({
          type: input.type,
          name: input.name,
          placeholder: input.placeholder
        }))
      }));
      
      // 獲取所有鏈接
      const links = Array.from(document.querySelectorAll('a')).map(a => ({
        href: a.href,
        text: a.innerText,
        isExternal: a.hostname !== window.location.hostname
      }));
      
      // 獲取所有按鈕文本
      const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText);
      
      // 獲取可能的彈窗或警告
      const alerts = Array.from(document.querySelectorAll('.alert, [role="alert"], .popup, .modal')).map(el => el.innerText);
      
      return {
        bodyText,
        forms,
        links,
        buttons,
        alerts,
        title: document.title,
        url: window.location.href
      };
    });
    
    // 獲取網站元數據
    const metadata = await page.evaluate(() => {
      const getMetaTagContent = (name) => {
        const element = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        return element ? element.getAttribute('content') : null;
      };
      
      return {
        title: document.title,
        description: getMetaTagContent('description') || getMetaTagContent('og:description'),
        keywords: getMetaTagContent('keywords'),
        author: getMetaTagContent('author'),
        siteName: getMetaTagContent('og:site_name')
      };
    });
    
    return {
      screenshot: screenshot.toString('base64'),
      content,
      metadata
    };
  } catch (error) {
    logger.error('獲取網站數據時發生錯誤:', error);
    
    // 記錄更詳細的錯誤信息
    if (error.message) {
      logger.error('錯誤信息:', error.message);
    }
    if (error.stack) {
      logger.error('錯誤堆棧:', error.stack);
    }
    
    return {
      screenshot: null,
      content: {
        bodyText: `無法獲取內容: ${error.message}`,
        forms: [],
        links: [],
        buttons: [],
        alerts: [],
        title: url,
        url: url
      },
      metadata: {
        title: url,
        description: null,
        keywords: null,
        author: null,
        siteName: null
      }
    };
  } finally {
    try {
      // 確保資源得到正確釋放
      if (page) await page.close();
      if (browser) await browser.close();
      logger.debug('Puppeteer 資源已釋放');
    } catch (closeError) {
      logger.error('關閉瀏覽器時發生錯誤:', closeError);
    }
  }
}

// 分析網站詐騙風險
async function analyzeFraudRisk(url, content, metadata) {
  try {
    // 使用 OpenAI 進行詐騙風險分析
    const completion = await openai.createChatCompletion({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: `你是一個專門分析網站詐騙風險的AI助手。你需要識別各種詐騙指標，包括但不限於：
          1. 誘導性或急迫性語言
          2. 虛假承諾或不合理優惠
          3. 要求提供敏感個人資訊
          4. 陌生或可疑的付款方式
          5. 缺乏聯繫資訊或合法身份驗證
          6. 使用知名品牌的假冒頁面
          7. 安全缺陷如缺少HTTPS
          8. 拼寫或語法錯誤
          分析結果需要包含：
          1. 風險分數(0-100)
          2. 詐騙風險類型分類
          3. 存在的具體危險指標
          4. 安全建議`
        },
        {
          role: "user",
          content: `請分析以下網站的詐騙風險：
          URL: ${url}
          
          網站標題: ${metadata.title}
          網站描述: ${metadata.description || '無'}
          
          網站內容摘要:
          ${content.bodyText.substring(0, 3000)}
          
          表單數量: ${content.forms.length}
          表單輸入欄位: ${JSON.stringify(content.forms.map(f => f.inputs.map(i => i.type)).flat())}
          
          外部鏈接數量: ${content.links.filter(l => l.isExternal).length}
          按鈕文本: ${JSON.stringify(content.buttons)}
          警告/彈窗內容: ${JSON.stringify(content.alerts)}
          
          請提供詳細分析，包含風險分數(0-100)，詳細理由，安全建議，以及JSON格式的總結結果。
          回覆請使用以下JSON格式:
          {
            "riskScore": 數字,
            "riskLevel": "低風險"/"中風險"/"高風險",
            "fraudTypes": ["詐騙類型1", "詐騙類型2"],
            "indicators": ["具體指標1", "具體指標2"],
            "safetyAdvice": ["建議1", "建議2"]
          }`
        }
      ],
      temperature: 0.7,
      max_tokens: 800,
      response_format: { type: "json_object" },
      timeout: API_TIMEOUT
    });

    const analysisResult = JSON.parse(completion.data.choices[0].message.content);
    
    // 為避免結果不符合預期格式的問題，確保所有字段都存在
    return {
      riskScore: analysisResult.riskScore || 0,
      riskLevel: analysisResult.riskLevel || '無法判斷',
      fraudTypes: analysisResult.fraudTypes || [],
      indicators: analysisResult.indicators || [],
      safetyAdvice: analysisResult.safetyAdvice || []
    };
  } catch (error) {
    logger.error('分析詐騙風險時出錯:', error);
    
    // 檢查是否是配額不足錯誤
    const isQuotaError = error.code === 'insufficient_quota' || 
                         (error.response && error.response.status === 429);
    
    // 返回模擬數據，並標記API問題
    return {
      riskScore: 75,
      riskLevel: '模擬數據',
      fraudTypes: ['API配額不足', '顯示模擬數據'],
      indicators: [
        'API配額不足，顯示模擬分析結果',
        '網站可能使用誘導性語言',
        '存在可疑的表單請求個人信息',
        '缺乏明確的隱私政策'
      ],
      safetyAdvice: [
        '請謹慎提供個人資料',
        '查看網站的安全連接(HTTPS)',
        '搜索網站的評價和評論',
        'API配額不足，建議日後重新檢測'
      ],
      isSimulatedData: true // 增加標記，表示這是模擬數據
    };
  }
}

// 識別截圖上的可疑區域
async function identifySuspiciousAreas(screenshot, content, analysis) {
  try {
    // 檢查是否為模擬數據
    if (analysis.isSimulatedData) {
      // 返回模擬的標記數據
      return [
        { top: 20, left: 10, width: 30, height: 5, label: '可疑登錄表單' },
        { top: 50, left: 40, width: 25, height: 8, label: '誘導點擊按鈕' },
        { top: 70, left: 5, width: 35, height: 7, label: '可疑優惠信息' }
      ];
    }
    
    if (analysis.riskScore < 30) {
      // 低風險網站不標記
      return [];
    }
    
    // 使用 OpenAI 視覺分析來標記可疑區域
    const indicators = analysis.indicators.join(", ");
    const completion = await openai.createChatCompletion({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: `你是一個專門識別網頁中詐騙元素的AI專家。你的任務是根據提供的詐騙指標，識別網頁截圖中應該標記的區域。
          需要標記的元素可能包括：
          1. 虛假的緊急提示或警告
          2. 可疑的表單請求敏感資訊
          3. 超高折扣或不合理優惠
          4. 假冒的品牌標誌或認證
          5. 可疑的聯繫方式
          對於每個應該標記的區域，提供以下資訊：
          1. 區域在螢幕上的相對位置（以百分比表示）
          2. 標記寬度和高度（以百分比表示）
          3. 簡短描述該區域可能的詐騙性質`
        },
        {
          role: "user",
          content: `根據分析，此網站有以下詐騙指標：${indicators}
          
          請根據這些指標，識別網頁中應該標記的可疑區域。根據網頁內容描述，推斷哪些UI元素可能是可疑的，並給出它們大致的位置。
          
          網頁內容摘要:
          標題: ${content.title}
          表單數量: ${content.forms.length}
          按鈕: ${JSON.stringify(content.buttons.slice(0, 10))}
          警告/彈窗: ${JSON.stringify(content.alerts)}
          
          請返回JSON格式的標記列表，每個標記包含top, left, width, height（均為百分比值）和label（標記描述）：
          [
            {"top": 20, "left": 10, "width": 30, "height": 5, "label": "可疑登錄表單"},
            ...
          ]`
        }
      ],
      temperature: 0.7,
      max_tokens: 800,
      response_format: { type: "json_object" },
      timeout: API_TIMEOUT
    });

    try {
      // 嘗試解析返回的JSON響應
      const markersResponse = JSON.parse(completion.data.choices[0].message.content);
      return Array.isArray(markersResponse) ? markersResponse : 
             (markersResponse.markers || []);
    } catch (error) {
      logger.error('解析標記數據時出錯:', error);
      
      // 如果解析失敗，生成一些合理的標記
      // 根據分析結果創建1-3個隨機位置的標記
      const markerCount = Math.min(analysis.indicators.length, 3);
      const randomMarkers = [];
      
      for (let i = 0; i < markerCount; i++) {
        randomMarkers.push({
          top: 20 + i * 20,
          left: 10 + i * 5,
          width: 30,
          height: 5,
          label: analysis.indicators[i] || '可疑內容'
        });
      }
      
      return randomMarkers;
    }
  } catch (error) {
    logger.error('識別可疑區域時出錯:', error);
    // 返回基於分析的簡單標記
    if (analysis.riskScore >= 70) {
      return [
        { top: 20, left: 10, width: 30, height: 5, label: '可疑內容' }
      ];
    }
    return [];
  }
}

// 啟動服務器
if (ENABLE_HTTPS) {
  try {
    const httpsOptions = {
      key: fs.readFileSync(SSL_KEY_PATH),
      cert: fs.readFileSync(SSL_CERT_PATH)
    };
    
    https.createServer(httpsOptions, app).listen(PORT, () => {
      logger.info(`HTTPS 服務器運行在 https://localhost:${PORT}`);
    });
  } catch (error) {
    logger.error(`無法啟動HTTPS服務器: ${error.message}`);
    logger.info('回退到HTTP模式...');
    
    app.listen(PORT, () => {
      logger.info(`HTTP 服務器運行在 http://localhost:${PORT}`);
    });
  }
} else {
  app.listen(PORT, () => {
    logger.info(`HTTP 服務器運行在 http://localhost:${PORT}`);
  });
} 