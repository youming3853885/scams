/**
 * Puppeteer 配置文件
 * 為不同的運行環境(本地、Render、Docker)提供最佳的Puppeteer啟動配置
 */

// 系統模塊
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const puppeteerCore = require('puppeteer-core');

/**
 * 獲取適用於當前環境的瀏覽器實例
 * 根據環境自動選擇合適的啟動選項和執行路徑
 */
async function getBrowser() {
  // 檢查是否在雲端環境中運行
  const isRender = process.env.RENDER === 'true';
  const isDocker = fs.existsSync('/.dockerenv');
  const isCloudEnvironment = isRender || isDocker;
  
  console.log(`🌐 環境檢測: Render=${isRender}, Docker=${isDocker}`);
  
  // 輸出所有重要環境變數，幫助調試
  console.log(`📊 環境變數狀態: 
    - PUPPETEER_EXECUTABLE_PATH=${process.env.PUPPETEER_EXECUTABLE_PATH || '未設置'} 
    - PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=${process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD || '未設置'}
    - NODE_ENV=${process.env.NODE_ENV || '未設置'}`);
  
  // 瀏覽器啟動配置
  const launchOptions = {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--window-size=1280,800',
      '--single-process'
    ]
  };
  
  // 在雲端環境中設置特定配置
  if (isCloudEnvironment) {
    console.log('☁️ 檢測到雲端環境，使用適配的Puppeteer配置');
    
    // 確定Chromium可執行文件路徑
    let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    
    if (!executablePath) {
      const possiblePaths = [
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        // Render 特定路徑
        '/opt/render/project/chrome-linux/chrome'
      ];
      
      for (const path of possiblePaths) {
        if (fs.existsSync(path)) {
          executablePath = path;
          console.log(`✅ 自動檢測到瀏覽器路徑: ${executablePath}`);
          // 動態設置環境變數，以便其他地方使用
          process.env.PUPPETEER_EXECUTABLE_PATH = executablePath;
          break;
        }
      }
      
      if (!executablePath) {
        console.warn('⚠️ 未找到Chrome/Chromium可執行文件，嘗試獲取已安裝瀏覽器的路徑');
        
        try {
          // 嘗試使用which命令查找chrome
          const { execSync } = require('child_process');
          const chromePath = execSync('which google-chrome-stable || which google-chrome || which chrome || which chromium').toString().trim();
          
          if (chromePath && fs.existsSync(chromePath)) {
            executablePath = chromePath;
            process.env.PUPPETEER_EXECUTABLE_PATH = executablePath;
            console.log(`✅ 通過which命令找到瀏覽器路徑: ${executablePath}`);
          } else {
            console.error('❌ 無法通過which命令找到瀏覽器，使用默認路徑');
            executablePath = '/usr/bin/google-chrome-stable'; // 更改默認路徑為google-chrome-stable
          }
        } catch (error) {
          console.error(`❌ 嘗試查找瀏覽器時出錯: ${error.message}`);
          executablePath = '/usr/bin/google-chrome-stable'; // 更改默認路徑為google-chrome-stable
        }
      }
    } else {
      console.log(`✅ 使用環境變數指定的瀏覽器路徑: ${executablePath}`);
    }
    
    console.log(`📝 最終使用的執行路徑: ${executablePath}`);
    
    // 檢查可執行文件是否真實存在
    if (!fs.existsSync(executablePath)) {
      console.error(`❌ 警告: 指定的可執行文件路徑不存在: ${executablePath}`);
      console.log('🔍 將嘗試安裝所需依賴...');
      
      try {
        const { execSync } = require('child_process');
        // 嘗試安裝Google Chrome而不是Chromium
        console.log('嘗試安裝Google Chrome...');
        
        // 由於Render限制，無法執行apt-get，這裡只輸出訊息，不執行安裝
        console.log('⚠️ Render環境中無法自動安裝瀏覽器，請確保環境變數指向正確的可執行文件路徑');
        
        // 切換到使用puppeteer的預設路徑
        console.log('切換為使用puppeteer預設瀏覽器');
        executablePath = '';
      } catch (installError) {
        console.error(`❌ 安裝Chrome失敗: ${installError.message}`);
        executablePath = ''; // 置空讓puppeteer使用自己的chrome
      }
    }
    
    // 使用puppeteer-core啟動瀏覽器
    try {
      if (executablePath) {
        console.log('🚀 使用puppeteer-core啟動瀏覽器...');
        launchOptions.executablePath = executablePath;
        return await puppeteerCore.launch(launchOptions);
      } else {
        console.log('🚀 路徑未指定，使用標準puppeteer啟動瀏覽器...');
        return await puppeteer.launch(launchOptions);
      }
    } catch (coreError) {
      console.error(`❌ 瀏覽器啟動失敗: ${coreError.message}`);
      console.error('⚠️ 嘗試使用標準puppeteer作為後備選項...');
      
      // 後備方案：使用標準puppeteer
      try {
        // 如果出錯，嘗試不指定執行路徑，讓puppeteer自己找
        const fallbackOptions = { ...launchOptions };
        delete fallbackOptions.executablePath;
        
        console.log('🔄 使用不指定執行路徑的方式重試...');
        return await puppeteer.launch(fallbackOptions);
      } catch (fallbackError) {
        console.error(`❌ 後備啟動方案也失敗: ${fallbackError.message}`);
        throw new Error(`Puppeteer啟動失敗: ${coreError.message}, 後備方案: ${fallbackError.message}`);
      }
    }
  } else {
    // 本地環境使用標準配置
    console.log('💻 檢測到本地環境，使用標準Puppeteer配置');
    try {
      return await puppeteer.launch(launchOptions);
    } catch (error) {
      console.error(`❌ 本地環境Puppeteer啟動失敗: ${error.message}`);
      throw error;
    }
  }
}

/**
 * 關閉瀏覽器實例
 * @param {Object} browser - Puppeteer瀏覽器實例
 */
async function closeBrowser(browser) {
  if (browser) {
    try {
      await browser.close();
      console.log('✅ 瀏覽器成功關閉');
    } catch (error) {
      console.error(`❌ 關閉瀏覽器時出錯: ${error.message}`);
    }
  }
}

module.exports = {
  getBrowser,
  closeBrowser
};
