/**
 * Render 啟動腳本
 * 處理 Puppeteer 在 Render 環境中的初始化並啟動主應用
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 檢查環境
const isRender = process.env.RENDER === 'true';

// 啟動前的準備工作
async function prepare() {
  console.log('正在準備 Render 環境...');
  
  if (isRender) {
    try {
      // 確保日誌目錄存在
      if (!fs.existsSync('./logs')) {
        fs.mkdirSync('./logs', { recursive: true });
        console.log('成功創建日誌目錄');
      }
      
      // 檢查 Chrome 是否已安裝
      try {
        const chromeVersion = execSync('google-chrome --version').toString().trim();
        console.log(`檢測到 Chrome 版本: ${chromeVersion}`);
      } catch (error) {
        console.log('未檢測到 Chrome，嘗試安裝必要依賴...');
        
        // 在 Render 環境中安裝 Chromium 依賴
        execSync('apt-get update && apt-get install -y chromium ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libxcomposite1 libxdamage1 libxfixes3 libxkbcommon0 libxrandr2 xdg-utils', { stdio: 'inherit' });
        
        // 再次檢查 Chrome 版本
        try {
          const chromeVersion = execSync('chromium --version').toString().trim();
          console.log(`安裝後檢測到 Chromium 版本: ${chromeVersion}`);
          // 設置環境變數指向 Chromium
          process.env.PUPPETEER_EXECUTABLE_PATH = '/usr/bin/chromium';
        } catch (installError) {
          console.error('Chromium 安裝失敗，將嘗試使用 Puppeteer 自帶的 Chrome');
        }
      }
    } catch (error) {
      console.error('環境準備過程中發生錯誤:', error);
      // 繼續執行，讓應用嘗試啟動
    }
  }

  // 啟動主應用
  console.log('啟動主應用...');
  require('./server.js');
}

// 執行準備工作並啟動應用
prepare().catch(error => {
  console.error('啟動過程中發生錯誤:', error);
  process.exit(1);
});
