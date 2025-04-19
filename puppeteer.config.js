/**
 * Puppeteer 配置文件
 * 為不同環境（本地開發、Render 雲部署和 Docker）提供適當的 Puppeteer 啟動選項
 */

const puppeteer = require('puppeteer');

/**
 * 獲取適合當前環境的瀏覽器實例
 * @returns {Promise<Browser>} Puppeteer 瀏覽器實例
 */
async function getBrowser() {
  // 判斷是否在 Render.com 或 Docker 環境
  const isRender = process.env.RENDER === 'true';
  const isDocker = process.env.DOCKER === 'true' || !!process.env.PUPPETEER_EXECUTABLE_PATH;
  
  // 通用啟動參數
  const launchOptions = {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1280,800'
    ],
    headless: 'new',
    timeout: 60000
  };
  
  // 針對雲環境的配置
  if (isRender || isDocker) {
    console.log('在雲環境中運行 Puppeteer');
    try {
      // 嘗試使用 puppeteer-core 而不是 puppeteer
      return require('puppeteer-core').launch({
        ...launchOptions,
        // 在 Render 上不需要指定 executablePath，使用瀏覽器自動查找
        ignoreDefaultArgs: ['--disable-extensions']
      });
    } catch (error) {
      console.log('無法使用 puppeteer-core，嘗試標準 puppeteer', error.message);
      // 降級回 puppeteer
      return puppeteer.launch(launchOptions);
    }
  }
  
  // 本地開發環境
  console.log('使用本地環境Puppeteer');
  return puppeteer.launch(launchOptions);
}

module.exports = { getBrowser };
