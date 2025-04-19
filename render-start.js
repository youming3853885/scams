/**
 * Render服務環境專用啟動腳本
 * 負責在Render服務環境中初始化必要的依賴並啟動應用程序
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 全局配置
const LOGS_DIR = path.join(process.cwd(), 'logs');
const MAX_RETRIES = 3;

/**
 * 初始化環境並啟動應用程序
 */
async function initializeEnvironment() {
  console.log('🚀 開始初始化Render環境...');
  
  try {
    // 記錄啟動環境信息
    console.log(`📊 環境信息:
    - NODE_ENV: ${process.env.NODE_ENV || '未設置'}
    - RENDER: ${process.env.RENDER || '未設置'}
    - RENDER_EXTERNAL_URL: ${process.env.RENDER_EXTERNAL_URL || '未設置'}
    - RENDER_SERVICE_ID: ${process.env.RENDER_SERVICE_ID || '未設置'}
    - PUPPETEER_EXECUTABLE_PATH: ${process.env.PUPPETEER_EXECUTABLE_PATH || '未設置'}
    - PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: ${process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD || '未設置'}
    `);
    
    // 檢查我們是否在Render環境中運行
    const isRender = process.env.RENDER === 'true' || 
                    process.env.RENDER_EXTERNAL_URL || 
                    process.env.RENDER_SERVICE_ID;
    
    if (!isRender) {
      console.log('ℹ️ 不在Render環境中，使用標準啟動流程...');
      return startApplication();
    }
    
    console.log('✅ 確認在Render環境中運行');
    
    // 1. 確保日誌目錄存在
    ensureLogsDirectory();
    
    // 2. 檢查Chrome可用性
    await checkAndPrepareChrome();
    
    // 3. 開始應用程序
    startApplication();
    
  } catch (error) {
    console.error(`❌ Render環境初始化失敗: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

/**
 * 確保日誌目錄存在
 */
function ensureLogsDirectory() {
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
      console.log(`✅ 創建日誌目錄: ${LOGS_DIR}`);
    } else {
      console.log(`✅ 日誌目錄已存在: ${LOGS_DIR}`);
    }
  } catch (error) {
    console.error(`❌ 創建日誌目錄失敗: ${error.message}`);
    throw error;
  }
}

/**
 * 檢查Chrome是否可用，並準備環境
 */
async function checkAndPrepareChrome() {
  console.log('🔍 檢查Chrome可用性...');
  
  // 可能的Chrome路徑
  const possiblePaths = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/opt/google/chrome/chrome',
    '/opt/render/project/chrome-linux/chrome'
  ];
  
  // 檢查Chrome是否已安裝
  let chromePath = null;
  for (const path of possiblePaths) {
    if (fs.existsSync(path)) {
      chromePath = path;
      break;
    }
  }
  
  if (chromePath) {
    console.log(`✅ 找到Chrome路徑: ${chromePath}`);
    
    // 檢查Chrome是否可執行
    try {
      const chromeVersion = execSync(`${chromePath} --version`).toString().trim();
      console.log(`✅ Chrome可執行，版本: ${chromeVersion}`);
      
      // 設置PUPPETEER_EXECUTABLE_PATH環境變量
      process.env.PUPPETEER_EXECUTABLE_PATH = chromePath;
      console.log(`✅ 設置PUPPETEER_EXECUTABLE_PATH=${chromePath}`);
      
      // 確保Chrome有執行權限
      makeExecutable(chromePath);
      
      return;
    } catch (error) {
      console.error(`⚠️ Chrome存在但無法執行: ${error.message}`);
    }
  }
  
  console.log('⚠️ 未找到預裝的Chrome，嘗試安裝必要依賴...');
  
  // 安裝Chrome依賴
  try {
    console.log('🔧 安裝Chrome依賴...');
    execSync(`
      apt-get update && 
      apt-get install -y wget gnupg ca-certificates &&
      apt-get install -y --no-install-recommends \
        xvfb \
        libgconf-2-4 \
        libatk1.0-0 \
        libatk-bridge2.0-0 \
        libgdk-pixbuf2.0-0 \
        libgtk-3-0 \
        libgbm-dev \
        libnss3 \
        libxss1 \
        libasound2 \
        fonts-liberation \
        libappindicator3-1 \
        lsb-release \
        xdg-utils
    `, { stdio: 'inherit' });
    console.log('✅ 依賴安裝成功');
  } catch (error) {
    console.error(`⚠️ 安裝依賴時出錯: ${error.message}`);
    console.log('⚠️ 繼續執行，讓Puppeteer嘗試自己處理...');
  }
  
  // 確保Puppeteer嘗試下載Chromium
  process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'false';
  console.log('✅ 設置PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false');
}

/**
 * 確保文件有執行權限
 */
function makeExecutable(filePath) {
  const permissions = getFilePermissions(filePath);
  
  // 檢查是否已有執行權限
  if ((permissions & 0o111) !== 0) {
    console.log(`✅ ${filePath} 已有執行權限`);
    return;
  }
  
  try {
    console.log(`🔧 添加執行權限到 ${filePath}`);
    fs.chmodSync(filePath, permissions | 0o111);
    console.log(`✅ 權限更新成功: ${filePath}`);
  } catch (error) {
    console.error(`⚠️ 無法更新權限: ${error.message}`);
  }
}

/**
 * 獲取文件權限
 */
function getFilePermissions(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.mode & 0o777;
  } catch (error) {
    console.error(`⚠️ 無法獲取文件權限: ${error.message}`);
    return 0;
  }
}

/**
 * 啟動主應用程序
 */
function startApplication() {
  let retries = 0;
  
  const startApp = () => {
    try {
      console.log('🚀 啟動主應用程序...');
      // 使用require來啟動server.js
      require('./server.js');
      console.log('✅ 應用程序啟動成功');
    } catch (error) {
      console.error(`❌ 應用程序啟動失敗: ${error.message}`);
      
      if (retries < MAX_RETRIES) {
        retries++;
        const delay = retries * 3000; // 延遲時間遞增
        console.log(`🔄 ${retries}/${MAX_RETRIES} 次重試，將在 ${delay/1000} 秒後重試...`);
        
        setTimeout(startApp, delay);
      } else {
        console.error(`❌ 已達到最大重試次數 (${MAX_RETRIES})，啟動失敗`);
        process.exit(1);
      }
    }
  };
  
  startApp();
}

// 執行初始化
initializeEnvironment().catch(error => {
  console.error(`❌ 初始化過程中發生錯誤: ${error.message}`);
  process.exit(1);
});
