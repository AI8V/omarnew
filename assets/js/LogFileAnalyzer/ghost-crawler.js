// assets/js/ghost-crawler.js - Operation: Ghost Evolved - The Mapmaker

(function() {
    'use strict';

    // --- DOM Elements ---
    const startUrlInput = document.getElementById('startUrl');
    const startCrawlBtn = document.getElementById('startCrawlBtn');
    const progressSection = document.getElementById('progress-section');
    const statusBar = document.getElementById('progress-bar');
    const statusText = document.getElementById('status-text');
    const crawlCounter = document.getElementById('crawl-counter');
    const resultsSection = document.getElementById('results-section');
    const healthScoreEl = document.getElementById('health-score');
    const brokenLinksCountEl = document.getElementById('broken-links-count');
    const serverErrorsCountEl = document.getElementById('server-errors-count');
    const issuesTableBody = document.getElementById('issues-table-body');
    const exportVisualizerBtn = document.getElementById('exportVisualizerBtn');
    
    // START: New Toast Elements
    const errorToastEl = document.getElementById('errorToast');
    const errorToast = bootstrap.Toast.getOrCreateInstance(errorToastEl);
    const toastBodyMessage = document.getElementById('toast-body-message');
    // END: New Toast Elements

    // --- State variables ---
    let crawledUrls;
    let queue;
    let issues;
    let healthScore;
    let origin;
    let pageData; // Map<url, pageObject> for easy access during crawl
    let crawlMap; // Final array for visualizer export

    // --- Event Listeners ---
    startCrawlBtn.addEventListener('click', startCrawl);
    if(exportVisualizerBtn) exportVisualizerBtn.addEventListener('click', exportForVisualizer);

    // --- Helper Function for Notifications ---
    function showToast(message) {
        if (toastBodyMessage) {
            toastBodyMessage.innerText = message;
            errorToast.show();
        } else {
            // Fallback to alert if toast element is not found for some reason
            alert(message);
        }
    }
    
    async function startCrawl() {
        const startUrl = startUrlInput.value.trim();
        if (!startUrl || !startUrl.startsWith('https://')) {
            // --- REPLACEMENT of alert() ---
            showToast('يرجى إدخال رابط صحيح يبدأ بـ ://https');
            return;
        }

        // --- Reset state for new crawl ---
        crawledUrls = new Set();
        queue = [{ url: startUrl, depth: 0 }]; // Queue now stores objects with depth
        issues = [];
        pageData = new Map();
        crawlMap = [];
        healthScore = 100;
        origin = new URL(startUrl).origin;
        
        issuesTableBody.innerHTML = '';
        progressSection.classList.remove('d-none');
        resultsSection.classList.add('d-none');
        if(exportVisualizerBtn) exportVisualizerBtn.classList.add('d-none'); // Hide export button until crawl is complete
        startCrawlBtn.disabled = true;
        startCrawlBtn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> جارِ الفحص...`;

        processNextInQueue();
    }

    async function processNextInQueue() {
        if (queue.length === 0 || crawledUrls.size >= 200) { // Crawl limit
            finishCrawl();
            return;
        }

        const { url: currentUrl, depth: currentDepth } = queue.shift();
        if (crawledUrls.has(currentUrl)) {
            processNextInQueue();
            return;
        }
        
        crawledUrls.add(currentUrl);
        updateProgress();
        statusText.innerText = `يفحص الآن: ${currentUrl}`;
            
        try {
            const proxyUrl = `https://throbbing-dew-da3c.amr-omar304.workers.dev/?url=${encodeURIComponent(currentUrl)}`;
            const response = await fetch(proxyUrl);
            const newLinks = await analyzeResponse(currentUrl, response, currentDepth);

            if (newLinks) {
                newLinks.forEach(link => {
                    try {
                        const absoluteUrl = new URL(link, origin).href;
                        if (absoluteUrl.startsWith(origin) && !crawledUrls.has(absoluteUrl) && !queue.some(q => q.url === absoluteUrl)) {
                            queue.push({ url: absoluteUrl, depth: currentDepth + 1 });
                        }
                    } catch(e) {
                        console.warn(`Invalid URL found and skipped: ${link}`);
                    }
                });
            }
        } catch (error) {
            console.error(`Failed to fetch ${currentUrl}:`, error);
            addIssue('Fetch Error', `لا يمكن الوصول إلى الرابط.`, currentUrl);
            healthScore -= 5;
        }
        
        setTimeout(processNextInQueue, 50);
    }
    
    async function analyzeResponse(url, response, depth) {
        const pageObject = {
            url: url,
            title: '',
            seo: {
                crawlDepth: depth,
                internalLinkEquity: 0, // Calculated post-crawl
                isOrphan: false,       // Calculated post-crawl
                isNoIndex: false,      // Assume false for simplicity
                contentAnalysis: {
                    outgoingInternalLinks: []
                }
            },
            issues: []
        };
        pageData.set(url, pageObject);

        if (!response.ok) {
            const errorType = response.status >= 500 ? 'Server Error (5xx)' : 'Broken Link (4xx)';
            addIssue(errorType, `كود الحالة: ${response.status}`, url);
            healthScore -= (response.status >= 500 ? 10 : 5);
            return [];
        }

        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const title = doc.querySelector('title')?.innerText || '';
        pageObject.title = title;
        if (!title || title.length < 10 || title.length > 60) {
            addIssue('SEO', `العنوان غير مثالي (الطول: ${title.length}).`, url);
            healthScore -= 2;
        }

        const description = doc.querySelector('meta[name="description"]')?.content || '';
        if (!description || description.length < 70 || description.length > 160) {
            addIssue('SEO', `الوصف التعريفي غير مثالي (الطول: ${description.length}).`, url);
            healthScore -= 2;
        }

        if (doc.querySelectorAll('h1').length !== 1) {
            addIssue('Structure', `تم العثور على ${doc.querySelectorAll('h1').length} من وسوم H1 (المطلوب 1).`, url);
            healthScore -= 5;
        }
        
        const links = Array.from(doc.querySelectorAll('a[href]')).map(a => a.getAttribute('href')).filter(Boolean);
        pageObject.seo.contentAnalysis.outgoingInternalLinks = links
            .map(link => {
                try {
                    return new URL(link, origin).href;
                } catch { return null; }
            })
            .filter(absoluteUrl => absoluteUrl && absoluteUrl.startsWith(origin));

        return links;
    }
    
    function finishCrawl() {
        statusText.innerText = 'اكتمل الفحص! جارِ حساب النتائج النهائية...';
        finalizeCrawlMap();
        displayResults();
        startCrawlBtn.disabled = false;
        startCrawlBtn.innerHTML = `<i class="bi bi-search ms-2"></i>ابدأ الفحص`;
        statusText.innerText = 'اكتمل الفحص!';
    }

    function finalizeCrawlMap() {
        const allPages = Array.from(pageData.values());

        // Calculate internalLinkEquity (incoming links)
        allPages.forEach(page => {
            page.seo.contentAnalysis.outgoingInternalLinks.forEach(targetUrl => {
                if (pageData.has(targetUrl)) {
                    pageData.get(targetUrl).seo.internalLinkEquity++;
                }
            });
        });

        // Identify orphan pages
        allPages.forEach(page => {
            if (page.seo.internalLinkEquity === 0 && page.seo.crawlDepth > 0) {
                page.seo.isOrphan = true;
                addIssue('Structure', 'صفحة يتيمة (لا توجد روابط داخلية إليها)', page.url);
            }
        });
        
        crawlMap = allPages;
    }

    function addIssue(type, description, url) {
        issues.push({ type, description, url });
        if (pageData.has(url)) {
            pageData.get(url).issues.push({ type, description });
        }
    }

    function updateProgress() {
        const queueSize = queue.length;
        const crawledSize = crawledUrls.size;
        const total = Math.min(200, queueSize + crawledSize);
        crawlCounter.innerText = `${crawledSize}/${total}`;
        const progressPercentage = total > 0 ? (crawledSize / total) * 100 : (queue.length > 0 ? 0 : 100);
        statusBar.style.width = `${progressPercentage}%`;
    }

    function displayResults() {
        resultsSection.classList.remove('d-none');
        healthScoreEl.innerText = Math.max(0, Math.round(healthScore));
        
        brokenLinksCountEl.innerText = issues.filter(i => i.type.includes('4xx') || i.type.includes('Fetch Error')).length;
        serverErrorsCountEl.innerText = issues.filter(i => i.type.includes('5xx')).length;

        if (issues.length === 0) {
            issuesTableBody.innerHTML = `<tr><td colspan="3" class="text-center text-success fw-bold">رائع! لم يتم العثور على مشاكل حرجة.</td></tr>`;
        } else {
            issuesTableBody.innerHTML = issues.sort((a, b) => getBadgeColor(b.type).localeCompare(getBadgeColor(a.type))).map(issue => `
                <tr>
                    <td><span class="badge bg-${getBadgeColor(issue.type)}">${issue.type}</span></td>
                    <td>${issue.description}</td>
                    <td><a href="${issue.url}" target="_blank" rel="noopener noreferrer" class="text-truncate d-inline-block" style="max-width: 250px;">${issue.url}</a></td>
                </tr>
            `).join('');
        }
        
        if (exportVisualizerBtn && crawlMap.length > 0) {
            exportVisualizerBtn.classList.remove('d-none');
        }
    }

    function getBadgeColor(type) {
        if (type.includes('Error') || type.includes('4xx') || type.includes('5xx')) return 'danger';
        if (type.includes('Structure')) return 'warning';
        return 'info';
    }

    function exportForVisualizer() {
        if (!crawlMap || crawlMap.length === 0) {
            showToast('لا توجد بيانات صالحة لتصديرها.');
            return;
        }
        const dataStr = JSON.stringify(crawlMap, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'search-index.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

})();