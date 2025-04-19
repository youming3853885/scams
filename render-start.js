/**
 * Render.com 啟動腳本
 * 專門為 Render 環境優化的啟動流程，確保 Puppeteer 正確初始化
 */

const fs = require('fs');
const { execSync, exec } = require('child_process');
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
    
    // 檢查瀏覽器是否已安裝
    try {
      console.log('🔍 檢查瀏覽器安裝狀態...');
      
      // 優先檢查的路徑
      const browserPaths = [
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/opt/render/project/chrome-linux/chrome'
      ];
      
      let browserFound = false;
      let browserPath = '';
      
      // 獲取文件訪問權限信息
      function getFilePermissions(filePath) {
        try {
          const stats = fs.statSync(filePath);
          return {
            exists: true,
            mode: stats.mode.toString(8),
            executable: !!(stats.mode & fs.constants.X_OK),
            user: stats.uid,
            group: stats.gid
          };
        } catch (err) {
          return { exists: false, error: err.message };
        }
      }
      
      for (const checkPath of browserPaths) {
        if (fs.existsSync(checkPath)) {
          browserPath = checkPath;
          browserFound = true;
          
          // 檢查文件權限
          const permissions = getFilePermissions(checkPath);
          console.log(`✅ 找到瀏覽器: ${browserPath}`);
          console.log(`📄 文件權限: mode=${permissions.mode}, 可執行=${permissions.executable}`);
          
          // 測試瀏覽器可執行性
          try {
            const versionOutput = execSync(`${browserPath} --version`).toString();
            console.log(`✅ 瀏覽器可執行確認，版本: ${versionOutput.trim()}`);
            
            // 設置 Puppeteer 執行路徑
            process.env.PUPPETEER_EXECUTABLE_PATH = browserPath;
            console.log(`✅ 設置 PUPPETEER_EXECUTABLE_PATH=${browserPath}`);
            break;
          } catch (execError) {
            console.warn(`⚠️ 瀏覽器存在但無法執行: ${execError.message}`);
            // 嘗試修復權限
            try {
              console.log(`🔧 嘗試修復 ${browserPath} 的權限`);
              // 注意：在某些環境下這可能需要sudo權限
              execSync(`chmod +x ${browserPath}`);
              console.log('✅ 權限修復完成');
            } catch (chmodError) {
              console.error(`❌ 無法修復權限: ${chmodError.message}`);
            }
          }
        }
      }
      
      // 如果未找到瀏覽器，嘗試通過 which 命令查找
      if (!browserFound) {
        console.log('🔍 未在標準位置找到瀏覽器，嘗試使用 which 命令查找...');
        
        try {
          const whichOutput = execSync('which google-chrome-stable || which google-chrome || which chrome || which chromium').toString().trim();
          
          if (whichOutput && fs.existsSync(whichOutput)) {
            browserPath = whichOutput;
            browserFound = true;
            console.log(`✅ 通過 which 命令找到瀏覽器: ${browserPath}`);
            
            // 設置 Puppeteer 執行路徑
            process.env.PUPPETEER_EXECUTABLE_PATH = browserPath;
            console.log(`✅ 設置 PUPPETEER_EXECUTABLE_PATH=${browserPath}`);
          } else {
            console.warn('⚠️ which 命令無法找到瀏覽器');
          }
        } catch (whichError) {
          console.warn(`⚠️ 執行 which 命令時出錯: ${whichError.message}`);
        }
      }
      
      // 特別偵測 Render 服務上 Chrome 的位置
      if (!browserFound) {
        console.log('🔍 嘗試檢測 Render 平台上的 Chrome 位置...');
        
        // 嘗試在系統範圍內查找 chrome 文件
        try {
          const findChromeOutput = execSync('find / -name "chrome" -type f 2>/dev/null || find / -name "google-chrome*" -type f 2>/dev/null || echo ""').toString().trim().split('\n');
          
          if (findChromeOutput && findChromeOutput.length > 0 && findChromeOutput[0]) {
            browserPath = findChromeOutput[0];
            browserFound = true;
            console.log(`✅ 通過系統查找找到瀏覽器: ${browserPath}`);
            
            // 設置 Puppeteer 執行路徑
            process.env.PUPPETEER_EXECUTABLE_PATH = browserPath;
            console.log(`✅ 設置 PUPPETEER_EXECUTABLE_PATH=${browserPath}`);
          } else {
            console.warn('⚠️ 系統查找無法找到瀏覽器');
          }
        } catch (findError) {
          console.warn(`⚠️ 執行系統查找命令時出錯: ${findError.message}`);
        }
      }
      
      // 確認最終設置
      if (!process.env.PUPPETEER_EXECUTABLE_PATH) {
        console.warn('⚠️ 未能找到可用的瀏覽器路徑，將使用 puppeteer 內置的瀏覽器');
        console.log('💡 注意：Render 環境中可能需要依賴已預安裝的 Chrome');
      } else {
        console.log(`🔍 檢查設置的瀏覽器路徑: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
        if (fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
          console.log('✅ 瀏覽器路徑存在');
        } else {
          console.error('❌ 警告: 設置的瀏覽器路徑不存在');
          delete process.env.PUPPETEER_EXECUTABLE_PATH;
          console.log('⚠️ 清除無效的路徑設置，使用 puppeteer 內置瀏覽器');
        }
      }
    } catch (browserError) {
      console.error('❌ 瀏覽器檢查時出錯:', browserError.message);
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
