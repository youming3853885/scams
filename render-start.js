/**
 * Render.com 啟動腳本
 * 專門為 Render 環境優化的啟動流程，確保 Puppeteer 正確初始化
 */

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// 設置日誌目錄
const LOG_DIR = path.join(__dirname, 'logs');

/**
 * 初始化應用程序環境
 */
function initializeEnvironment() {
  console.log('🚀 [Render] 啟動應用程序初始化...');
  
  // 強制設置 Render 環境標誌
  process.env.RENDER = 'true';
  
  // 檢查是否在 Render 環境中
  const isRenderEnv = process.env.RENDER_EXTERNAL_URL || 
                     process.env.RENDER_SERVICE_ID || 
                     process.env.IS_RENDER;
  
  if (isRenderEnv) {
    console.log('✅ 已確認在 Render 環境中運行');
  } else {
    console.log('📌 未明確檢測到 Render 環境，但仍將使用 Render 配置');
  }
  
  // 在非開發環境中設置 NODE_ENV 為 production
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'production';
    console.log('✅ 設置 NODE_ENV=production');
  }
  
  try {
    // 確保日誌目錄存在
    if (!fs.existsSync(LOG_DIR)) {
      console.log(`📁 創建日誌目錄: ${LOG_DIR}`);
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    
    // 設置 Puppeteer 相關環境變數
    process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';
    console.log('✅ 設置 PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true');
    
    // 檢查 Chromium 是否已安裝
    try {
      console.log('🔍 檢查 Chromium 安裝狀態...');
      
      // 優先檢查的路徑
      const chromiumPaths = [
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/opt/render/project/chrome-linux/chrome'
      ];
      
      let chromiumFound = false;
      let chromiumPath = '';
      
      for (const checkPath of chromiumPaths) {
        if (fs.existsSync(checkPath)) {
          chromiumPath = checkPath;
          chromiumFound = true;
          console.log(`✅ 找到 Chromium: ${chromiumPath}`);
          
          // 設置 Puppeteer 執行路徑
          process.env.PUPPETEER_EXECUTABLE_PATH = chromiumPath;
          console.log(`✅ 設置 PUPPETEER_EXECUTABLE_PATH=${chromiumPath}`);
          
          // 檢查 Chromium 版本
          try {
            const versionOutput = execSync(`${chromiumPath} --version`).toString();
            console.log(`ℹ️ Chromium 版本: ${versionOutput.trim()}`);
          } catch (versionError) {
            console.warn(`⚠️ 無法獲取 Chromium 版本: ${versionError.message}`);
          }
          
          break;
        }
      }
      
      // 如果未找到 Chromium，嘗試通過 which 命令查找
      if (!chromiumFound) {
        console.log('🔍 未在標準位置找到 Chromium，嘗試使用 which 命令查找...');
        
        try {
          const whichOutput = execSync('which chromium || which google-chrome || which chrome').toString().trim();
          
          if (whichOutput && fs.existsSync(whichOutput)) {
            chromiumPath = whichOutput;
            chromiumFound = true;
            console.log(`✅ 通過 which 命令找到 Chromium: ${chromiumPath}`);
            
            // 設置 Puppeteer 執行路徑
            process.env.PUPPETEER_EXECUTABLE_PATH = chromiumPath;
            console.log(`✅ 設置 PUPPETEER_EXECUTABLE_PATH=${chromiumPath}`);
          } else {
            console.warn('⚠️ which 命令無法找到 Chromium');
          }
        } catch (whichError) {
          console.warn(`⚠️ 執行 which 命令時出錯: ${whichError.message}`);
        }
      }
      
      // 如果仍未找到 Chromium，嘗試安裝
      if (!chromiumFound) {
        console.warn('⚠️ 未找到 Chromium，嘗試安裝必要依賴...');
        
        try {
          // 安裝 Chromium 依賴
          console.log('🔧 執行: apt-get update && apt-get install -y chromium');
          execSync('apt-get update && apt-get install -y chromium fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 --no-install-recommends', 
            { stdio: 'inherit' });
          
          if (fs.existsSync('/usr/bin/chromium')) {
            chromiumPath = '/usr/bin/chromium';
            console.log(`✅ Chromium 安裝成功，路徑: ${chromiumPath}`);
            
            // 設置 Puppeteer 執行路徑
            process.env.PUPPETEER_EXECUTABLE_PATH = chromiumPath;
            console.log(`✅ 設置 PUPPETEER_EXECUTABLE_PATH=${chromiumPath}`);
          } else {
            console.error('❌ Chromium 安裝後找不到可執行文件');
            
            // 嘗試查找安裝後的任何 Chrome 或 Chromium
            try {
              const findOutput = execSync('find /usr -name chrome -type f -executable || find /usr -name chromium -type f -executable').toString().trim().split('\n')[0];
              
              if (findOutput && fs.existsSync(findOutput)) {
                chromiumPath = findOutput;
                console.log(`✅ 通過 find 命令找到 Chrome: ${chromiumPath}`);
                
                // 設置 Puppeteer 執行路徑
                process.env.PUPPETEER_EXECUTABLE_PATH = chromiumPath;
                console.log(`✅ 設置 PUPPETEER_EXECUTABLE_PATH=${chromiumPath}`);
              } else {
                console.error('❌ 無法找到 Chrome 可執行文件');
              }
            } catch (findError) {
              console.error(`❌ 查找 Chrome 可執行文件時出錯: ${findError.message}`);
            }
          }
        } catch (installError) {
          console.error('❌ 安裝依賴失敗:', installError.message);
        }
      }
      
      // 確認最終設置
      if (!process.env.PUPPETEER_EXECUTABLE_PATH) {
        console.error('❌ 無法設置 PUPPETEER_EXECUTABLE_PATH，這可能導致 Puppeteer 無法運行');
        // 設置一個后備执行路径
        process.env.PUPPETEER_EXECUTABLE_PATH = '/usr/bin/chromium';
        console.log(`⚠️ 使用默認後備執行路徑: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
      }
    } catch (chromiumError) {
      console.error('❌ Chromium 檢查時出錯:', chromiumError.message);
    }
    
    // 記錄所有環境變數狀態
    console.log('🔧 環境變數配置狀態:');
    console.log(`- NODE_ENV: ${process.env.NODE_ENV || '未設置'}`);
    console.log(`- RENDER: ${process.env.RENDER || '未設置'}`);
    console.log(`- PUPPETEER_EXECUTABLE_PATH: ${process.env.PUPPETEER_EXECUTABLE_PATH || '未設置'}`);
    console.log(`- PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: ${process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD || '未設置'}`);
    console.log(`- OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '已設置(已隱藏)' : '未設置'}`);
    console.log(`- OPENAI_MODEL: ${process.env.OPENAI_MODEL || '未設置'}`);
    
    // 啟動主應用程序
    console.log('🚀 啟動主應用程序...');
    return require('./server');
    
  } catch (error) {
    console.error('❌ Render 初始化失敗:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// 執行初始化
initializeEnvironment();
