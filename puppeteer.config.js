/**
 * Puppeteer配置文件 - 處理不同環境下的瀏覽器設置
 * 支持本地、Render和Docker環境
 */

const os = require('os');
const fs = require('fs');
const path = require('path');

// 全局配置
const DEFAULT_TIMEOUT = 60000; // 60秒超時
let browser = null; // 瀏覽器實例（全局共享）

// 輸出環境信息，幫助調試
function logEnvironmentInfo() {
  console.log('📊 Puppeteer環境信息:');
  console.log(`- 平台: ${os.platform()}`);
  console.log(`- 架構: ${os.arch()}`);
  console.log(`- Node版本: ${process.version}`);
  console.log(`- 內存總量: ${Math.round(os.totalmem() / (1024 * 1024 * 1024))}GB`);
  console.log(`- 可用內存: ${Math.round(os.freemem() / (1024 * 1024 * 1024))}GB`);
  console.log(`- CPU數量: ${os.cpus().length}`);
  
  // 檢測特殊環境
  const isRender = process.env.RENDER === 'true' || 
                   !!process.env.RENDER_SERVICE_ID || 
                   !!process.env.RENDER_EXTERNAL_URL;
  
  const isDocker = fs.existsSync('/.dockerenv') || 
                  (fs.existsSync('/proc/self/cgroup') && 
                   fs.readFileSync('/proc/self/cgroup', 'utf8').includes('docker'));
  
  console.log(`- Render環境: ${isRender ? '是' : '否'}`);
  console.log(`- Docker環境: ${isDocker ? '是' : '否'}`);
  
  // 檢查Chrome可執行文件路徑
  const execPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  console.log(`- PUPPETEER_EXECUTABLE_PATH: ${execPath || '未設置'}`);
  if (execPath) {
    console.log(`  - 路徑存在: ${fs.existsSync(execPath) ? '是' : '否'}`);
  }
}

/**
 * 獲取瀏覽器實例
 * 如果已經存在實例，則重用；否則創建新實例
 * @param {object} options - 自定義Puppeteer選項
 * @returns {Promise<Browser>} Puppeteer瀏覽器實例
 */
async function getBrowser(options = {}) {
  try {
    // 輸出環境信息
    logEnvironmentInfo();
    
    // 檢查是否已有可用的瀏覽器實例
    if (browser && browser.connected) {
      console.log('✅ 重用現有的瀏覽器實例');
      return browser;
    }
    
    // 如果有斷開連接的瀏覽器實例，釋放它
    if (browser) {
      console.log('🔄 清理斷開連接的瀏覽器實例');
      await closeBrowser();
    }
    
    console.log('🚀 啟動新的瀏覽器實例...');
    
    // 檢測環境
    const isRender = process.env.RENDER === 'true' || 
                     !!process.env.RENDER_SERVICE_ID || 
                     !!process.env.RENDER_EXTERNAL_URL;
    
    const isDocker = fs.existsSync('/.dockerenv') || 
                    (fs.existsSync('/proc/self/cgroup') && 
                     fs.readFileSync('/proc/self/cgroup', 'utf8').includes('docker'));
    
    // 基本啟動參數
    const defaultArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1280,720',
    ];
    
    // 根據環境添加特定參數
    const launchOptions = {
      headless: 'new',
      args: [...defaultArgs],
      ignoreHTTPSErrors: true,
      timeout: options.timeout || DEFAULT_TIMEOUT
    };
    
    // Render環境特定配置
    if (isRender) {
      console.log('🔧 配置Render環境特定選項');
      launchOptions.args.push(
        '--disable-features=AudioServiceOutOfProcess',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-component-extensions-with-background-pages',
        '--single-process', // 在內存受限環境中可能有幫助
        '--disable-features=TranslateUI'
      );
      
      // 如果設置了PUPPETEER_EXECUTABLE_PATH，使用它
      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        console.log(`✅ 使用自定義Chrome路徑: ${launchOptions.executablePath}`);
      }
    }
    
    // Docker環境特定配置
    if (isDocker) {
      console.log('🔧 配置Docker環境特定選項');
      launchOptions.args.push(
        '--disable-features=AudioServiceOutOfProcess',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-breakpad',
        '--disable-component-extensions-with-background-pages',
        '--disable-features=TranslateUI'
      );
      
      // 如果設置了PUPPETEER_EXECUTABLE_PATH，使用它
      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        console.log(`✅ 使用自定義Chrome路徑: ${launchOptions.executablePath}`);
      }
    }
    
    // 合併用戶提供的選項
    const finalOptions = { ...launchOptions, ...options };
    console.log('📋 最終啟動選項:', finalOptions);
    
    // 嘗試啟動瀏覽器
    try {
      const puppeteer = require('puppeteer');
      console.log('🔍 嘗試使用標準配置啟動瀏覽器...');
      browser = await puppeteer.launch(finalOptions);
      console.log('✅ 瀏覽器啟動成功');
    } catch (error) {
      console.error(`❌ 瀏覽器啟動失敗: ${error.message}`);
      
      // 如果第一次嘗試失敗，嘗試使用最小配置
      try {
        console.log('🔄 嘗試使用最小配置重新啟動瀏覽器...');
        const puppeteer = require('puppeteer');
        const minimalOptions = {
          headless: 'new',
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
          ignoreHTTPSErrors: true
        };
        
        // 如果設置了可執行路徑，保留它
        if (finalOptions.executablePath) {
          minimalOptions.executablePath = finalOptions.executablePath;
        }
        
        browser = await puppeteer.launch(minimalOptions);
        console.log('✅ 使用最小配置啟動瀏覽器成功');
      } catch (retryError) {
        console.error(`❌ 最小配置啟動也失敗: ${retryError.message}`);
        throw new Error(`無法啟動瀏覽器: ${retryError.message}`);
      }
    }
    
    // 在瀏覽器關閉時清除引用
    browser.on('disconnected', () => {
      console.log('🔔 瀏覽器已斷開連接');
      browser = null;
    });
    
    return browser;
  } catch (error) {
    console.error(`❌ getBrowser錯誤: ${error.message}`);
    throw error;
  }
}

/**
 * 關閉瀏覽器實例
 * @returns {Promise<void>}
 */
async function closeBrowser() {
  try {
    if (browser) {
      console.log('🔒 關閉瀏覽器實例');
      await browser.close();
      browser = null;
      console.log('✅ 瀏覽器已關閉');
    } else {
      console.log('ℹ️ 沒有活動的瀏覽器實例需要關閉');
    }
  } catch (error) {
    console.error(`❌ 關閉瀏覽器時出錯: ${error.message}`);
    // 強制設置為null，即使關閉時出錯
    browser = null;
  }
}

module.exports = {
  getBrowser,
  closeBrowser
};
