// 頁面切換功能
function showPage(pageId) {
    // 隱藏所有頁面
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // 顯示指定頁面
    document.getElementById(pageId).classList.add('active');
}

function goToHome() {
    showPage('page-home');
    // 重置輸入
    document.getElementById('url-input').value = '';
    // 清除先前的錯誤消息
    document.getElementById('error-message').textContent = '';
    document.getElementById('error-message').style.display = 'none';
}

// 全局變量用於存儲最近一次的掃描結果
let lastScanResult = null;

function goToLoading() {
    const url = document.getElementById('url-input').value.trim();
    
    if (!url) {
        showError('請輸入有效的網址');
        return;
    }
    
    // 驗證URL格式
    if (!isValidUrl(url)) {
        showError('請輸入有效的網址，例如: https://example.com');
        return;
    }
    
    // 隱藏錯誤消息
    document.getElementById('error-message').style.display = 'none';
    
    // 顯示載入頁面
    showPage('page-loading');
    
    // 重置進度條
    document.querySelector('.progress').style.width = '0%';
    
    // 開始掃描
    scanWebsite(url);
}

// 顯示錯誤消息
function showError(message) {
    const errorElement = document.getElementById('error-message');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
}

function updateLoadingStatus(message, progress) {
    document.querySelector('.status').textContent = message;
    document.querySelector('.progress').style.width = `${progress}%`;
}

function goToResults() {
    showPage('page-results');
}

function goToDetails() {
    showPage('page-details');
}

// URL驗證函數
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// 掃描網站的主函數
async function scanWebsite(url) {
    try {
        // 更新載入狀態
        updateLoadingStatus('正在獲取網站資訊...', 20);
        
        // 設置請求超時
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('請求超時，網站可能無法訪問')), 60000);
        });
        
        // 同時等待請求和超時
        const response = await Promise.race([
            fetch('/api/scan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url })
            }).catch(error => {
                console.error('Fetch錯誤詳情:', error);
                throw new Error(`網路請求失敗: ${error.message}`);
            }),
            timeoutPromise
        ]);
        
        updateLoadingStatus('正在分析網站內容...', 50);
        
        if (!response.ok) {
            // 嘗試獲取詳細的錯誤信息
            let errorDetail = '伺服器錯誤';
            try {
                const errorData = await response.json();
                errorDetail = errorData.error || `伺服器錯誤 (${response.status}): ${response.statusText}`;
                
                // 處理特定錯誤類型
                if (response.status === 429) {
                    errorDetail = '已超過今日掃描限制，請明天再試';
                } else if (response.status === 503) {
                    errorDetail = '伺服器負載過高，請稍後再試';
                }
            } catch (e) {
                errorDetail = `伺服器錯誤 (${response.status}): ${response.statusText}`;
            }
            
            throw new Error(errorDetail);
        }
        
        updateLoadingStatus('正在生成風險評估報告...', 80);
        
        // 解析後端返回的結果
        const result = await response.json();
        
        // 儲存結果供後續使用
        lastScanResult = result;
        
        // 顯示分析結果
        displayAnalysisResults(result);
        
        updateLoadingStatus('完成!', 100);
        
        // 導航到結果頁面
        setTimeout(() => {
            goToResults();
        }, 500);
    } catch (error) {
        console.error('掃描失敗:', error);
        
        // 根據錯誤類型設置不同的錯誤信息
        let errorMessage = error.message;
        
        // 針對常見錯誤類型提供更友好的提示
        if (errorMessage.includes('網路請求失敗') || errorMessage.includes('請求超時')) {
            errorMessage = `無法連接到伺服器或目標網站: ${errorMessage}`;
        } else if (errorMessage.includes('API配額')) {
            errorMessage = '分析API配額已用盡，請稍後再試';
        }
        
        updateLoadingStatus(`掃描失敗: ${errorMessage}`, 100);
        
        // 添加重試按鈕
        const loadingContainer = document.querySelector('.loading-container');
        
        // 檢查是否已經有重試按鈕
        let retryButton = document.querySelector('#retry-button');
        if (!retryButton) {
            retryButton = document.createElement('button');
            retryButton.id = 'retry-button';
            retryButton.innerHTML = '<i class="fas fa-redo"></i> 重新掃描';
            retryButton.addEventListener('click', () => {
                // 移除重試按鈕
                retryButton.remove();
                // 重新調用掃描
                scanWebsite(url);
            });
            loadingContainer.appendChild(retryButton);
        }
        
        // 添加返回按鈕
        let backButton = document.querySelector('#loading-back-button');
        if (!backButton) {
            backButton = document.createElement('button');
            backButton.id = 'loading-back-button';
            backButton.className = 'secondary-button';
            backButton.innerHTML = '<i class="fas fa-arrow-left"></i> 返回首頁';
            backButton.addEventListener('click', () => {
                goToHome();
                showError(errorMessage);
            });
            loadingContainer.appendChild(backButton);
        }
    }
}

/**
 * 顯示分析結果
 * @param {Object} result - 分析結果對象
 */
function displayAnalysisResults(result) {
    try {
        console.log('顯示分析結果:', result);
        
        // 更新掃描時間
        const now = new Date();
        const scanTime = now.toLocaleString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        document.getElementById('scan-time').textContent = scanTime;
        
        // 計算並顯示風險分數
        const riskScore = Math.round(result.riskScore);
        document.getElementById('risk-score').textContent = riskScore;
        
        // 根據風險分數設置風險級別和顏色
        let riskLevel, riskColor;
        if (riskScore >= 80) {
            riskLevel = '高風險';
            riskColor = '#e74c3c';
        } else if (riskScore >= 50) {
            riskLevel = '中風險';
            riskColor = '#f39c12';
        } else if (riskScore >= 20) {
            riskLevel = '低風險';
            riskColor = '#3498db';
        } else {
            riskLevel = '安全';
            riskColor = '#2ecc71';
        }
        
        document.getElementById('risk-level').textContent = riskLevel;
        document.getElementById('risk-level').style.color = riskColor;
        document.getElementById('risk-score-circle').style.stroke = riskColor;
        
        // 計算並設置圓環的填充百分比
        const circumference = 2 * Math.PI * 42; // 圓的周長
        const offset = circumference - (riskScore / 100) * circumference;
        document.getElementById('risk-score-circle').style.strokeDashoffset = offset;
        
        // 更新網站信息
        document.getElementById('website-url').textContent = result.url;
        document.getElementById('website-url').setAttribute('title', result.url);
        document.getElementById('website-url').href = result.url;
        
        if (result.title) {
            document.getElementById('website-title').textContent = result.title;
            document.getElementById('website-title').setAttribute('title', result.title);
        } else {
            document.getElementById('website-title').textContent = '無法獲取網站標題';
        }

        // 處理截圖顯示
        const screenshotContainer = document.getElementById('screenshot');
        screenshotContainer.className = 'screenshot';
        screenshotContainer.innerHTML = '';

        if (result.screenshot && result.screenshot !== 'error') {
            // 創建並加載截圖
            const img = new Image();
            img.onload = function() {
                // 清除掃描標記容器
                document.querySelectorAll('.scam-marker').forEach(marker => marker.remove());
                
                // 添加可疑區域標記
                if (result.suspiciousAreas && result.suspiciousAreas.length > 0) {
                    displaySuspiciousAreas(result.suspiciousAreas, img.width, img.height);
                }
            };
            
            img.onerror = function() {
                displayScreenshotError('無法加載截圖');
            };
            
            img.src = result.screenshot;
            screenshotContainer.appendChild(img);
        } else {
            displayScreenshotError('無法獲取網站截圖');
        }
        
        // 顯示詐騙特徵
        const scamFeaturesContainer = document.getElementById('scam-features');
        scamFeaturesContainer.innerHTML = '';
        
        if (result.scamFeatures && result.scamFeatures.length > 0) {
            result.scamFeatures.forEach((feature, index) => {
                const featureElement = createScamFeatureElement(feature, index);
                scamFeaturesContainer.appendChild(featureElement);
            });
        } else {
            scamFeaturesContainer.innerHTML = '<div class="no-features">未檢測到明顯詐騙特徵</div>';
        }
        
        // 顯示安全警告
        const warningsContainer = document.getElementById('warnings');
        warningsContainer.innerHTML = '';
        
        if (result.warnings && result.warnings.length > 0) {
            result.warnings.forEach(warning => {
                const warningElement = document.createElement('div');
                warningElement.className = 'warning';
                warningElement.textContent = warning;
                warningsContainer.appendChild(warningElement);
            });
        } else {
            warningsContainer.innerHTML = '<div class="no-warnings">未發現安全警告</div>';
        }
        
        // 更新詳細威脅信息
        updateThreatDetail('identity-theft', result.identityTheftScore || 0);
        updateThreatDetail('financial-fraud', result.financialFraudScore || 0);
        updateThreatDetail('malware-risk', result.malwareScore || 0);
        updateThreatDetail('privacy-risk', result.privacyRiskScore || 0);
        
        // 創建風險分析圖表
        createRiskChart(result);
        
        // 顯示結果頁面
        showPage('results-page');
    } catch (error) {
        console.error('顯示分析結果時發生錯誤:', error);
        showError('處理分析結果時發生錯誤。請重試。');
        goToHome();
    }
}

/**
 * 創建詐騙特徵元素
 * @param {Object} feature - 詐騙特徵對象
 * @param {Number} index - 索引
 * @returns {HTMLElement} - 特徵元素
 */
function createScamFeatureElement(feature, index) {
    const featureElement = document.createElement('div');
    featureElement.className = 'scam-feature';
    featureElement.dataset.index = index;
    
    // 添加圖標
    const iconElement = document.createElement('div');
    iconElement.className = 'feature-icon';
    
    const icon = document.createElement('i');
    icon.className = getFeatureIcon(feature.type);
    iconElement.appendChild(icon);
    
    // 添加文本
    const textElement = document.createElement('div');
    textElement.className = 'feature-text';
    textElement.textContent = feature.description;
    
    featureElement.appendChild(iconElement);
    featureElement.appendChild(textElement);
    
    // 根據特徵類型添加相應的點擊事件
    if (feature.areaId !== undefined) {
        featureElement.addEventListener('mouseenter', () => {
            highlightSuspiciousArea(feature.areaId);
        });
        
        featureElement.addEventListener('mouseleave', () => {
            unhighlightSuspiciousAreas();
        });
        
        featureElement.addEventListener('click', () => {
            scrollToAndFocusArea(feature.areaId);
        });
        
        // 添加指示器，表明可點擊
        featureElement.classList.add('clickable');
        const indicator = document.createElement('span');
        indicator.className = 'clickable-indicator';
        indicator.innerHTML = '<i class="fas fa-search-location"></i>';
        indicator.title = '點擊可在截圖中查看此問題';
        featureElement.appendChild(indicator);
    }
    
    return featureElement;
}

/**
 * 根據特徵類型獲取對應的圖標
 * @param {String} type - 特徵類型
 * @returns {String} - 圖標類名
 */
function getFeatureIcon(type) {
    const iconMap = {
        'phishing': 'fas fa-fish',
        'scam': 'fas fa-exclamation-triangle',
        'malware': 'fas fa-bug',
        'spam': 'fas fa-envelope',
        'suspicious': 'fas fa-question-circle',
        'redirect': 'fas fa-random',
        'identity_theft': 'fas fa-id-card',
        'financial': 'fas fa-money-bill',
        'privacy': 'fas fa-user-secret',
        'misleading': 'fas fa-ban',
        'fake_content': 'fas fa-copy',
        'urgency': 'fas fa-clock',
        'poor_security': 'fas fa-unlock',
        'clickbait': 'fas fa-mouse-pointer'
    };
    
    return iconMap[type] || 'fas fa-exclamation-circle';
}

/**
 * 顯示截圖錯誤
 * @param {String} message - 錯誤信息
 */
function displayScreenshotError(message) {
    const screenshotContainer = document.getElementById('screenshot');
    screenshotContainer.className = 'screenshot-error';
    screenshotContainer.innerHTML = `
        <i class="fas fa-image-slash"></i>
        <p>${message || '無法獲取網站截圖'}</p>
    `;
}

/**
 * 顯示可疑區域
 * @param {Array} areas - 可疑區域數組
 * @param {Number} imgWidth - 圖片寬度
 * @param {Number} imgHeight - 圖片高度
 */
function displaySuspiciousAreas(areas, imgWidth, imgHeight) {
    const screenshotContainer = document.getElementById('screenshot');
    const containerWidth = screenshotContainer.offsetWidth;
    const containerHeight = screenshotContainer.offsetHeight;
    
    // 計算縮放比例
    const scaleX = containerWidth / imgWidth;
    const scaleY = containerHeight / imgHeight;
    
    areas.forEach((area, index) => {
        // 創建標記元素
        const marker = document.createElement('div');
        marker.className = 'scam-marker';
        marker.dataset.id = index;
        
        // 計算標記位置和大小
        const left = area.x * scaleX;
        const top = area.y * scaleY;
        const width = area.width * scaleX;
        const height = area.height * scaleY;
        
        marker.style.left = `${left}px`;
        marker.style.top = `${top}px`;
        marker.style.width = `${width}px`;
        marker.style.height = `${height}px`;
        
        // 添加標籤
        const label = document.createElement('div');
        label.className = 'marker-label';
        label.textContent = area.label || `可疑區域 ${index + 1}`;
        marker.appendChild(label);
        
        // 添加點擊事件
        marker.addEventListener('click', () => {
            // 切換高亮狀態
            marker.classList.toggle('highlighted');
            
            // 如果有對應的特徵，也高亮顯示
            highlightMatchingFeature(index);
        });
        
        screenshotContainer.appendChild(marker);
    });
}

/**
 * 高亮顯示特定的可疑區域
 * @param {Number} areaId - 區域ID
 */
function highlightSuspiciousArea(areaId) {
    const marker = document.querySelector(`.scam-marker[data-id="${areaId}"]`);
    if (marker) {
        marker.classList.add('highlighted');
    }
}

/**
 * 取消高亮顯示所有可疑區域
 */
function unhighlightSuspiciousAreas() {
    document.querySelectorAll('.scam-marker').forEach(marker => {
        marker.classList.remove('highlighted');
    });
}

/**
 * 高亮顯示匹配的特徵
 * @param {Number} areaId - 區域ID
 */
function highlightMatchingFeature(areaId) {
    document.querySelectorAll('.scam-feature').forEach(feature => {
        feature.classList.remove('highlighted');
    });
    
    const matchingFeature = document.querySelector(`.scam-feature[data-index="${areaId}"]`);
    if (matchingFeature) {
        matchingFeature.classList.add('highlighted');
        matchingFeature.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

/**
 * 滾動到並聚焦特定區域
 * @param {Number} areaId - 區域ID
 */
function scrollToAndFocusArea(areaId) {
    const marker = document.querySelector(`.scam-marker[data-id="${areaId}"]`);
    if (marker) {
        // 獲取截圖容器
        const screenshotContainer = document.getElementById('screenshot-container');
        
        // 滾動到截圖容器
        screenshotContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // 高亮顯示標記
        unhighlightSuspiciousAreas();
        setTimeout(() => {
            marker.classList.add('highlighted');
            // 閃爍效果
            setTimeout(() => {
                marker.classList.remove('highlighted');
                setTimeout(() => {
                    marker.classList.add('highlighted');
                }, 200);
            }, 200);
        }, 500);
    }
}

/**
 * 更新威脅詳情
 * @param {String} id - 威脅ID
 * @param {Number} score - 威脅分數
 */
function updateThreatDetail(id, score) {
    const element = document.getElementById(id);
    if (!element) return;
    
    const scoreElement = element.querySelector('.threat-score');
    const levelElement = element.querySelector('.threat-level');
    
    // 更新分數
    scoreElement.textContent = Math.round(score);
    
    // 更新級別
    let level, color;
    if (score >= 80) {
        level = '嚴重';
        color = '#e74c3c';
    } else if (score >= 50) {
        level = '中等';
        color = '#f39c12';
    } else if (score >= 20) {
        level = '輕微';
        color = '#3498db';
    } else {
        level = '無風險';
        color = '#2ecc71';
    }
    
    levelElement.textContent = level;
    levelElement.style.color = color;
    
    // 更新進度條
    const progressBar = element.querySelector('.progress-fill');
    progressBar.style.width = `${score}%`;
    progressBar.style.backgroundColor = color;
}

// 報告URL函數
function reportUrl() {
    if (!lastScanResult) {
        alert('沒有可報告的URL');
        return;
    }
    
    alert(`感謝您的報告。我們已收到您對 ${lastScanResult.url} 的舉報，並將進行審核。`);
}

// 分享結果
function shareResults() {
    if (!lastScanResult) {
        alert('沒有可分享的結果');
        return;
    }
    
    // 構建要分享的文本
    const shareText = `我使用網站詐騙檢測工具檢測了 ${lastScanResult.url}，詐騙風險評分為 ${lastScanResult.analysis.riskScore}%。`;
    
    // 嘗試使用Web Share API
    if (navigator.share) {
        navigator.share({
            title: '網站詐騙檢測結果',
            text: shareText,
            url: window.location.href
        })
        .catch(error => {
            console.error('分享失敗:', error);
            fallbackShare(shareText);
        });
    } else {
        fallbackShare(shareText);
    }
}

// 後備分享方法
function fallbackShare(text) {
    // 創建臨時輸入框
    const input = document.createElement('textarea');
    input.value = text;
    document.body.appendChild(input);
    
    // 選擇文本
    input.select();
    input.setSelectionRange(0, 99999);
    
    // 複製到剪貼板
    document.execCommand('copy');
    
    // 移除臨時輸入框
    document.body.removeChild(input);
    
    alert('分享文本已複製到剪貼板!');
}

// 更新詳細分析頁面
function updateDetailedAnalysis(analysis) {
    // 更新詳細卡片
    const detailsContent = document.querySelector('.details-content');
    detailsContent.innerHTML = ''; // 清空現有內容
    
    // 定義風險類別及其相應的圖標
    const riskCategories = [
        { name: '身份驗證風險', icon: 'fa-fingerprint', level: analysis.riskScore > 60 ? 'high-risk' : 'medium-risk', description: '評估網站身份驗證的可信度和安全性。' },
        { name: '資料安全', icon: 'fa-lock', level: analysis.riskScore > 70 ? 'high-risk' : 'medium-risk', description: '評估網站如何處理和保護用戶數據。' },
        { name: '網站可信度', icon: 'fa-history', level: analysis.riskScore > 50 ? 'high-risk' : 'low-risk', description: '評估網站的整體真實性和可信度。' },
        { name: '內容分析', icon: 'fa-comment-alt', level: analysis.riskScore > 40 ? 'high-risk' : 'medium-risk', description: '評估網站內容中的詐騙指標。' }
    ];
    
    // 生成風險類別卡片
    riskCategories.forEach((category, index) => {
        const detailCard = document.createElement('div');
        detailCard.className = 'detail-card';
        
        const fillWidth = category.level === 'high-risk' ? 90 : (category.level === 'medium-risk' ? 60 : 30);
        
        detailCard.innerHTML = `
            <h3><i class="fas ${category.icon}"></i> ${category.name}</h3>
            <div class="risk-meter ${category.level}">
                <div class="meter-fill" style="width: ${fillWidth}%"></div>
                <span>${category.level === 'high-risk' ? '高風險' : (category.level === 'medium-risk' ? '中風險' : '低風險')}</span>
            </div>
            <p>${analysis.indicators[index] || category.description}</p>
        `;
        
        detailsContent.appendChild(detailCard);
    });
    
    // 更新安全建議
    const tipsList = document.querySelector('.tips-section ul');
    tipsList.innerHTML = ''; // 清空現有內容
    
    // 添加安全建議
    analysis.safetyAdvice.forEach(advice => {
        const li = document.createElement('li');
        li.textContent = advice;
        tipsList.appendChild(li);
    });
}

// 初始化頁面
document.addEventListener('DOMContentLoaded', function() {
    // 入口頁面
    showPage('page-home');
    
    // 綁定回車鍵搜索
    document.getElementById('url-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            goToLoading();
        }
    });
    
    // 綁定詳細分析按鈕
    document.querySelector('.scam-score').addEventListener('click', function() {
        goToDetails();
    });
    
    // 分享按鈕
    document.getElementById('share-button').addEventListener('click', function() {
        shareResults();
    });
    
    // 回報按鈕
    document.getElementById('report-button').addEventListener('click', function() {
        reportUrl();
    });
}); 