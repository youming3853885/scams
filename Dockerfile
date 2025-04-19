FROM node:18-slim

# 安裝 Google Chrome 依賴及調試工具
RUN apt-get update \
    && apt-get install -y wget gnupg procps \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 確認Chrome安裝並顯示版本
RUN google-chrome-stable --version

# 設置工作目錄
WORKDIR /app

# 複製 package.json 和 package-lock.json
COPY package*.json ./

# 設置環境變數
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable \
    RENDER=true \
    NODE_ENV=production

# 安裝依賴
RUN npm install

# 創建日誌目錄
RUN mkdir -p logs

# 複製所有文件
COPY . .

# 確保Chrome可執行文件有正確的權限
RUN chmod +x /usr/bin/google-chrome-stable

# 暴露端口
EXPOSE 3000

# 啟動應用
CMD ["node", "render-start.js"]
