/**
 * @type {import('puppeteer').Configuration}
 */
module.exports = {
  // 設置自定義可執行檔案路徑
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  // 在瀏覽器啟動時添加額外參數
  defaultArgs: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
    '--disable-extensions'
  ],
  // 在 Render 上使用 puppeteer-core
  cacheDirectory: process.env.RENDER ? '/tmp/puppeteer' : undefined
};
