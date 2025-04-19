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
const { getBrowser, closeBrowser } = require('./puppeteer.config');
const uuid = require('uuid');
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

// 在生產環境或 Render 環境中信任代理
if (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true') {
  console.log('🔒 設置信任代理，適應 Render 環境');
  app.set('trust proxy', 1);
}

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

// 初始化日誌系統
const { format, transports } = winston;

// 確保日誌目錄存在
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 日誌格式化
const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.splat(),
  format.json()
);

// 創建日誌對象
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  defaultMeta: { service: 'scam-detector' },
  transports: [
    // 控制台輸出
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, requestId, ...meta }) => {
          return `${timestamp} ${level} ${requestId ? `[${requestId}] ` : ''}${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
      )
    }),
    // 文件輸出 - 錯誤日誌
    new transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
    // 文件輸出 - 全部日誌
    new transports.File({ 
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    })
  ]
});

// 將全局錯誤處理器添加到Express
app.use((err, req, res, next) => {
  const requestId = req.headers['x-request-id'] || uuid.v4();
  logger.error(`未捕獲的錯誤: ${err.message}`, { requestId, stack: err.stack });
  res.status(500).json({ 
    error: 'Internal Server Error', 
    message: '服務器內部錯誤，請稍後再試' 
  });
});

// 處理根路徑請求
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 處理健康檢查請求
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 測試API連接
app.get('/api/test-openai', async (req, res) => {
  try {
    logger.info('測試OpenAI API連接...');
    
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",  // 使用較便宜的模型進行測試
      messages: [
        {role: "user", content: "Hello world"}
      ],
      max_tokens: 10
    });
    
    if (completion.data && completion.data.choices && completion.data.choices.length > 0) {
      logger.info('OpenAI API測試成功');
      res.json({
        status: 'success',
        message: 'API連接正常',
        model: OPENAI_MODEL,
        responsePreview: completion.data.choices[0].message.content
      });
    } else {
      throw new Error('API返回了異常的響應結構');
    }
  } catch (error) {
    logger.error('OpenAI API測試失敗:', error);
    
    let errorMessage = 'API測試失敗';
    let errorCode = 'unknown_error';
    
    if (error.response) {
      errorCode = `status_${error.response.status}`;
      errorMessage = `API響應錯誤: ${error.response.status} ${error.response.statusText}`;
      if (error.response.data && error.response.data.error) {
        errorMessage += ` - ${error.response.data.error.message || error.response.data.error}`;
      }
    } else if (error.message) {
      errorMessage = error.message;
      
      if (error.message.includes('quota')) {
        errorCode = 'quota_exceeded';
      } else if (error.message.includes('key')) {
        errorCode = 'invalid_api_key';
      } else if (error.message.includes('network')) {
        errorCode = 'network_error';
      }
    }
    
    res.status(500).json({
      status: 'error',
      message: errorMessage,
      code: errorCode,
      details: error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : null
    });
  }
});

// 在服務器啟動前檢查API密鑰
function validateAPIKey() {
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your_openai_api_key_here') {
    logger.error('未設置有效的OpenAI API密鑰，系統將使用模擬數據');
    return false;
  }
  
  // 簡單檢查密鑰格式
  if (!OPENAI_API_KEY.startsWith('sk-') || OPENAI_API_KEY.length < 20) {
    logger.error('OpenAI API密鑰格式可能不正確，系統可能使用模擬數據');
    return false;
  }
  
  logger.info('OpenAI API密鑰格式驗證通過');
  return true;
}

// 在應用初始化時調用
const isValidAPIKey = validateAPIKey();

// 掃描網站 API 端點
app.post('/api/scan', async (req, res) => {
  const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  activeRequests++;
  
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: '請提供有效的網址' });
    }

    // 檢查快取
    if (ENABLE_CACHE) {
      const cacheKey = `scan:${url}`;
      if (cache[cacheKey] && cache[cacheKey].expiry > Date.now()) {
        logger.info(`[${requestId}] 從快取返回分析: ${url}`);
        activeRequests--;
        return res.json(cache[cacheKey].data);
      }
    }

    // 檢查並發請求數
    if (activeRequests > MAX_CONCURRENT_REQUESTS) {
      // 將請求添加到隊列中
      logger.info(`[${requestId}] 已達到最大並發請求數，添加到隊列`);
      return new Promise((resolve, reject) => {
        requestQueue.push(() => {
          // 使用單獨的requestId
          const queuedRequestId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
          logger.info(`[${queuedRequestId}] 從隊列中處理請求: ${url}`);
          
          processScanRequest(url, queuedRequestId)
            .then(result => {
              handleScanResult(result, url, queuedRequestId, res);
              resolve();
            })
            .catch(error => {
              handleScanError(error, queuedRequestId, res);
              reject(error);
            })
            .finally(() => {
              activeRequests--;
              processNextQueueItem();
            });
        });
      });
    }

    // 直接處理請求
    const result = await processScanRequest(url, requestId);
    handleScanResult(result, url, requestId, res);
  } catch (error) {
    handleScanError(error, requestId, res);
  } finally {
    activeRequests--;
    processNextQueueItem();
  }
});

// 處理掃描結果
function handleScanResult(result, url, requestId, res) {
  // 加工返回結果
  const processedResult = {
    ...result,
    screenshot: result.screenshot ? `data:image/jpeg;base64,${result.screenshot}` : null
  };
  
  // 儲存到快取
  if (ENABLE_CACHE) {
    const cacheKey = `scan:${url}`;
    cache[cacheKey] = {
      data: processedResult,
      expiry: Date.now() + (CACHE_TTL * 1000)
    };
    
    // 檢查快取大小
    if (Object.keys(cache).length > MAX_CACHE_ITEMS) {
      // 移除最舊的項目
      const oldestKey = Object.keys(cache).sort((a, b) => 
        cache[a].expiry - cache[b].expiry
      )[0];
      if (oldestKey) {
        delete cache[oldestKey];
        logger.debug(`[${requestId}] 移除最舊的快取項: ${oldestKey}`);
      }
    }
  }
  
  logger.info(`[${requestId}] 成功完成掃描: ${url}`);
  res.json(processedResult);
}

// 處理掃描錯誤
function handleScanError(error, requestId, res) {
  // 提供更詳細的錯誤信息
  let statusCode = 500;
  let errorMessage = '掃描過程中發生錯誤';
  
  if (error.message && error.message.includes('無法獲取網站數據')) {
    statusCode = 400;
    errorMessage = '無法獲取網站數據，請確認URL是否有效';
  } else if (error.message && error.message.includes('超時')) {
    statusCode = 408;
    errorMessage = '網站加載超時，請稍後再試';
  } else if (error.message && error.message.includes('name_not_resolved')) {
    statusCode = 400;
    errorMessage = '無法解析域名，請檢查URL是否正確';
  } else if (error.message && error.message.includes('connection_refused')) {
    statusCode = 503;
    errorMessage = '連接被拒絕，該網站可能不可用';
  }
  
  // 返回錯誤響應
  logger.error(`[${requestId}] 掃描失敗: ${errorMessage}`);
  res.status(statusCode).json({ 
    error: true,
    message: errorMessage,
    details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    timestamp: new Date().toISOString(),
    requestId
  });
  
  if (error.errorScreenshot) {
    logger.debug(`[${requestId}] 包含錯誤截圖`);
  }
}

// 處理下一個隊列項目
function processNextQueueItem() {
  if (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT_REQUESTS) {
    const nextRequest = requestQueue.shift();
    nextRequest();
  }
}

// 處理掃描請求
async function processScanRequest(url, requestId) {
  logger.info(`開始處理掃描請求`, { requestId, url });
  
  try {
    // 1. 獲取網站數據
    logger.debug(`正在獲取網站數據`, { requestId, url });
    const websiteData = await getWebsiteData(url, requestId);
    
    if (!websiteData || !websiteData.screenshot) {
      logger.error(`無法獲取網站數據`, { requestId, url });
      throw new Error('無法獲取網站數據');
    }
    
    // 2. 分析欺詐風險
    logger.debug(`正在分析欺詐風險`, { requestId, url });
    const riskAnalysis = await analyzeFraudRisk(websiteData, requestId);
    
    // 3. 如果風險分數高，識別可疑區域
    let suspiciousAreas = [];
    if (riskAnalysis.riskScore >= SUSPICIOUS_THRESHOLD) {
      logger.debug(`檢測到高風險，識別可疑區域`, { requestId, url, riskScore: riskAnalysis.riskScore });
      suspiciousAreas = await identifySuspiciousAreas(websiteData, riskAnalysis, requestId);
    }
    
    // 構建結果
    const result = {
      url,
      timestamp: new Date().toISOString(),
      screenshot: websiteData.screenshot,
      title: websiteData.title || '未知網站',
      riskScore: riskAnalysis.riskScore,
      riskLevel: getRiskLevel(riskAnalysis.riskScore),
      scamFeatures: riskAnalysis.scamFeatures || [],
      warnings: riskAnalysis.warnings || [],
      suspiciousAreas,
      metadata: websiteData.metadata || {}
    };
    
    logger.info(`掃描完成`, { 
      requestId, 
      url, 
      riskScore: result.riskScore, 
      riskLevel: result.riskLevel 
    });
    
    return result;
  } catch (error) {
    logger.error(`掃描過程中出錯`, { 
      requestId, 
      url, 
      errorMessage: error.message,
      errorType: error.name,
      errorStack: error.stack
    });
    
    // 構建錯誤響應
    const errorDetails = {
      code: getErrorCode(error),
      message: getErrorMessage(error),
      isTimeout: error.name === 'TimeoutError' || error.message.includes('timeout'),
      url
    };
    
    throw {
      isExpectedError: true,
      ...errorDetails
    };
  }
}

// 獲取錯誤代碼
function getErrorCode(error) {
  if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
    return 'TIMEOUT_ERROR';
  } else if (error.message.includes('net::ERR_NAME_NOT_RESOLVED') || 
             error.message.includes('ENOTFOUND')) {
    return 'DOMAIN_NOT_FOUND';
  } else if (error.message.includes('net::ERR_CONNECTION_REFUSED') || 
             error.message.includes('ECONNREFUSED')) {
    return 'CONNECTION_REFUSED';
  } else if (error.message.includes('net::ERR_CERT_')) {
    return 'SSL_ERROR';
  } else if (error.message.includes('Protocol error')) {
    return 'PROTOCOL_ERROR';
  } else {
    return 'GENERAL_ERROR';
  }
}

// 獲取錯誤消息
function getErrorMessage(error) {
  const code = getErrorCode(error);
  
  switch (code) {
    case 'TIMEOUT_ERROR':
      return '網站加載超時，可能是網站響應緩慢或者無法訪問';
    case 'DOMAIN_NOT_FOUND':
      return '域名無法解析，請確認網址是否正確';
    case 'CONNECTION_REFUSED':
      return '連接被拒絕，服務器可能不可用';
    case 'SSL_ERROR':
      return 'SSL/TLS證書錯誤，網站的安全證書可能已過期或無效';
    case 'PROTOCOL_ERROR':
      return '協議錯誤，無法正確通信';
    default:
      return `掃描過程中出錯: ${error.message}`;
  }
}

// 獲取風險等級
function getRiskLevel(score) {
  if (score < 20) return '安全';
  if (score < 40) return '低風險';
  if (score < 60) return '中風險';
  if (score < 80) return '高風險';
  return '極高風險';
}

// 獲取網站數據
async function getWebsiteData(url, requestId) {
  logger.debug(`正在獲取網站數據`, { requestId, url });
  
  // 確保URL格式正確
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
    logger.debug(`URL已格式化`, { requestId, url });
  }
  
  const { getBrowser, closeBrowser } = require('./puppeteer.config');
  let browser = null;
  let page = null;
  
  try {
    // 啟動瀏覽器
    logger.debug(`正在啟動瀏覽器`, { requestId });
    browser = await getBrowser();
    
    // 創建新頁面
    page = await browser.newPage();
    logger.debug(`已創建新頁面`, { requestId });
    
    // 設置超時
    await page.setDefaultTimeout(30000);
    
    // 設置截圖視口大小
    await page.setViewport({ width: 1280, height: 800 });
    
    // 設置用戶代理
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36');
    
    // 訪問URL
    logger.info(`正在訪問URL`, { requestId, url });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    
    // 等待頁面加載
    await page.waitForTimeout(2000);
    
    // 截取全屏截圖
    logger.debug(`正在截取網站截圖`, { requestId });
    const screenshot = await page.screenshot({ 
      fullPage: false,
      encoding: 'base64'
    });
    
    // 獲取網頁內容
    logger.debug(`正在獲取網頁內容`, { requestId });
    const content = await page.content();
    
    // 獲取網頁標題
    const title = await page.title();
    
    // 提取元數據
    logger.debug(`正在提取網頁元數據`, { requestId });
    const metadata = await extractMetadata(page);
    
    logger.info(`成功獲取網站數據`, { requestId, url, title });
    
    return {
      screenshot: `data:image/png;base64,${screenshot}`,
      content,
      title,
      metadata
    };
  } catch (error) {
    logger.error(`獲取網站數據時出錯`, { 
      requestId, 
      url, 
      errorMessage: error.message,
      errorStack: error.stack 
    });
    
    // 嘗試捕獲錯誤截圖
    if (page) {
      try {
        const errorScreenshot = await page.screenshot({ fullPage: false, encoding: 'base64' });
        logger.debug(`已捕獲錯誤截圖`, { requestId });
        
        return {
          error: true,
          errorMessage: error.message,
          screenshot: `data:image/png;base64,${errorScreenshot}`,
          title: '錯誤'
        };
      } catch (screenshotError) {
        logger.error(`無法捕獲錯誤截圖`, { 
          requestId, 
          errorMessage: screenshotError.message 
        });
      }
    }
    
    throw error;
  } finally {
    // 關閉頁面和釋放資源
    if (page) {
      logger.debug(`正在關閉頁面`, { requestId });
      await page.close().catch(err => logger.error(`關閉頁面時出錯`, { 
        requestId, 
        errorMessage: err.message 
      }));
    }
    
    // 保持瀏覽器實例運行以供其他請求使用
    // 如果需要關閉瀏覽器，請在應用程序退出時或長時間空閒後執行
  }
}

// 分析網站詐騙風險
async function analyzeFraudRisk(websiteData, requestId) {
  try {
    logger.info(`[${requestId}] 開始分析詐騙風險: ${websiteData.url}`);
    
    // 檢查內容是否存在錯誤
    if (websiteData.error) {
      logger.warn(`[${requestId}] 使用有限內容進行分析，因原始內容獲取失敗: ${websiteData.error}`);
    }
    
    // 使用 OpenAI 進行詐騙風險分析
    const completionData = {
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
          URL: ${websiteData.url}
          
          網站標題: ${websiteData.title}
          網站描述: ${websiteData.metadata.description || '無'}
          
          網站內容摘要:
          ${websiteData.content.bodyText.substring(0, 3000)}
          
          表單數量: ${websiteData.content.forms.length}
          表單輸入欄位: ${JSON.stringify(websiteData.content.forms.map(f => f.inputs.map(i => i.type)).flat())}
          
          外部鏈接數量: ${websiteData.content.links.filter(l => l.isExternal).length}
          按鈕文本: ${JSON.stringify(websiteData.content.buttons)}
          警告/彈窗內容: ${JSON.stringify(websiteData.content.alerts)}
          
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
      response_format: { type: "json_object" }
    };
    
    logger.debug(`[${requestId}] 發送 OpenAI 請求，模型: ${OPENAI_MODEL}`);
    
    const completion = await openai.createChatCompletion(completionData);

    const analysisResult = JSON.parse(completion.data.choices[0].message.content);
    logger.info(`[${requestId}] 分析完成，風險分數: ${analysisResult.riskScore || 0}`);
    
    // 為避免結果不符合預期格式的問題，確保所有字段都存在
    return {
      riskScore: analysisResult.riskScore || 0,
      riskLevel: analysisResult.riskLevel || '無法判斷',
      fraudTypes: analysisResult.fraudTypes || [],
      indicators: analysisResult.indicators || [],
      safetyAdvice: analysisResult.safetyAdvice || []
    };
  } catch (error) {
    logger.error(`[${requestId}] 分析詐騙風險時出錯:`, error);
    
    // 詳細記錄API錯誤
    if (error.response) {
      logger.error(`[${requestId}] API響應錯誤:`, {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    
    // 更精確地檢查是否是配額不足錯誤
    const isQuotaError = 
      (error.code === 'insufficient_quota') || 
      (error.response && error.response.status === 429) ||
      (error.message && error.message.includes('quota'));
    
    if (isQuotaError) {
      logger.error(`[${requestId}] API配額不足錯誤`);
    } else {
      logger.error(`[${requestId}] 非配額錯誤，可能是API密鑰錯誤或請求格式問題`);
    }
    
    // 返回模擬數據，並標記API問題
    return {
      riskScore: 75,
      riskLevel: '模擬數據',
      fraudTypes: [isQuotaError ? 'API配額不足' : 'API請求錯誤', '顯示模擬數據'],
      indicators: [
        isQuotaError ? 'API配額不足，顯示模擬分析結果' : `API錯誤: ${error.message || '未知錯誤'}`,
        '網站可能使用誘導性語言',
        '存在可疑的表單請求個人信息',
        '缺乏明確的隱私政策'
      ],
      safetyAdvice: [
        '請謹慎提供個人資料',
        '查看網站的安全連接(HTTPS)',
        '搜索網站的評價和評論',
        isQuotaError ? 'API配額不足，建議日後重新檢測' : '系統錯誤，建議聯繫管理員'
      ],
      isSimulatedData: true,
      errorType: isQuotaError ? 'quota' : 'api' // 添加錯誤類型標記
    };
  }
}

// 識別截圖上的可疑區域
async function identifySuspiciousAreas(websiteData, riskAnalysis, requestId) {
  try {
    logger.info(`[${requestId}] 開始識別可疑區域`);
    
    // 檢查是否為模擬數據或無截圖
    if (riskAnalysis.isSimulatedData || !websiteData.screenshot) {
      logger.info(`[${requestId}] 使用模擬標記數據`);
      // 返回模擬的標記數據
      return [
        { top: 20, left: 10, width: 30, height: 5, label: '可疑登錄表單' },
        { top: 50, left: 40, width: 25, height: 8, label: '誘導點擊按鈕' },
        { top: 70, left: 5, width: 35, height: 7, label: '可疑優惠信息' }
      ];
    }
    
    if (riskAnalysis.riskScore < 30) {
      // 低風險網站不標記
      logger.info(`[${requestId}] 低風險網站，不標記可疑區域`);
      return [];
    }
    
    // 使用 OpenAI 視覺分析來標記可疑區域
    const indicators = riskAnalysis.indicators.join(", ");
    logger.debug(`[${requestId}] 使用以下指標識別可疑區域: ${indicators}`);
    
    const completionData = {
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
          標題: ${websiteData.title}
          表單數量: ${websiteData.content.forms.length}
          按鈕: ${JSON.stringify(websiteData.content.buttons.slice(0, 10))}
          警告/彈窗: ${JSON.stringify(websiteData.content.alerts)}
          
          請返回JSON格式的標記列表，每個標記包含top, left, width, height（均為百分比值）和label（標記描述）：
          [
            {"top": 20, "left": 10, "width": 30, "height": 5, "label": "可疑登錄表單"},
            ...
          ]`
        }
      ],
      temperature: 0.7,
      max_tokens: 800,
      response_format: { type: "json_object" }
    };
    
    logger.debug(`[${requestId}] 發送 OpenAI 請求識別可疑區域，模型: ${OPENAI_MODEL}`);
    
    const completion = await openai.createChatCompletion(completionData);

    try {
      // 嘗試解析返回的JSON響應
      const markersResponse = JSON.parse(completion.data.choices[0].message.content);
      const markers = Array.isArray(markersResponse) ? markersResponse : 
                     (markersResponse.markers || []);
      
      logger.info(`[${requestId}] 成功識別 ${markers.length} 個可疑區域`);
      return markers;
    } catch (error) {
      logger.error(`[${requestId}] 解析標記數據時出錯:`, error);
      
      // 如果解析失敗，生成一些合理的標記
      // 根據分析結果創建1-3個隨機位置的標記
      const markerCount = Math.min(riskAnalysis.indicators.length, 3);
      const randomMarkers = [];
      
      for (let i = 0; i < markerCount; i++) {
        randomMarkers.push({
          top: 20 + i * 20,
          left: 10 + i * 5,
          width: 30,
          height: 5,
          label: riskAnalysis.indicators[i] || '可疑內容'
        });
      }
      
      logger.info(`[${requestId}] 使用後備標記數據，生成 ${randomMarkers.length} 個標記`);
      return randomMarkers;
    }
  } catch (error) {
    logger.error(`[${requestId}] 識別可疑區域時出錯:`, error);
    // 返回基於分析的簡單標記
    if (riskAnalysis.riskScore >= 70) {
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
