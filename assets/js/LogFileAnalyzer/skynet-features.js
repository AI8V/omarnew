// assets/js/skynet-features.js - "Operation: Skynet" - ARMORED AND FINAL.

(function() {
    'use strict';

    // --- Skynet State ---
    let analysisA = null;
    let analysisB = null;
    let comparisonWorker;

    // --- DOM Elements ---
    const comparisonDropZoneContainer = document.getElementById('comparison-drop-zone-container');
    const comparisonDropZone = document.getElementById('comparisonDropZone');
    const comparisonFileInput = document.getElementById('comparisonFileInput');
    const comparisonContainer = document.getElementById('comparison-container');
    const insightsContainer = document.getElementById('insights-container');
    const insightsList = document.getElementById('insights-list');
    
    const delta404El = document.getElementById('delta-404');
    const deltaBotsEl = document.getElementById('delta-bots');
    const deltaNewPagesEl = document.getElementById('delta-new-pages');

    function initializeComparisonWorker() {
        if (!window.Worker) return;
        comparisonWorker = new Worker('../assets/js/LogFileAnalyzer/log-worker.js');
        comparisonWorker.onmessage = function(event) {
            const { type, result, error } = event.data;
            if (type === 'complete') {
                analysisB = result;
                runIntelligenceAnalysis();
            } else if (error) {
                alert(`خطأ في تحليل ملف المقارنة: ${error}`);
            }
        };
    }

    async function handleComparisonFileSelect(event) {
        const file = event.target.files[0];
        if (!file || !comparisonWorker) return;
        
        try {
            const fileContent = file.name.endsWith('.zip') ? await readZipFile(file) : await readFileContent(file);
            comparisonWorker.postMessage(fileContent);
        } catch (error) {
            alert(`خطأ في قراءة ملف المقارنة: ${error.message}`);
        }
    }

    function runIntelligenceAnalysis() {
        if (!analysisA || !analysisB) return;
        const { delta404, deltaBots, newPagesCount } = compareAnalyses(analysisA, analysisB);
        displayComparisonResults(delta404, deltaBots, newPagesCount);
        const { anomalies, recommendations } = generateInsights(analysisB); // Insights on the LATEST file
        displayInsights(anomalies, recommendations);
    }
    
    function compareAnalyses(dataA, dataB) {
        const getMetrics = (data) => {
            const metrics = { notFoundCount: 0, botCount: 0, urls: new Set() };
            data.allParsedLines.forEach(line => {
                if (line.statusCode === 404) metrics.notFoundCount++;
                if (line.botType !== 'Other' && line.isVerified) metrics.botCount++;
                metrics.urls.add(line.request.split('?')[0]);
            });
            return metrics;
        };
        const metricsA = getMetrics(dataA);
        const metricsB = getMetrics(dataB);

        const delta404 = metricsB.notFoundCount - metricsA.notFoundCount;
        const deltaBots = metricsB.botCount - metricsA.botCount;
        
        let newPagesCount = 0;
        metricsB.urls.forEach(url => {
            if (!metricsA.urls.has(url)) newPagesCount++;
        });

        return { delta404, deltaBots, newPagesCount };
    }

    function generateInsights(data) {
        const anomalies = [];
        const recommendations = [];
        const ipPageHits = {};
        let total404s = 0;

        data.allParsedLines.forEach(line => {
            if (line.statusCode === 404) total404s++;
            const key = `${line.ip}|${line.request.split('?')[0]}`;
            ipPageHits[key] = (ipPageHits[key] || 0) + 1;
        });

        for (const [key, count] of Object.entries(ipPageHits)) {
            if (count > 20) {
                const [ip, page] = key.split('|');
                anomalies.push(`زحف غير طبيعي (${count} مرة) من IP <strong>${ip}</strong> على الصفحة <code>${page}</code>.`);
            }
        }
        
        if (total404s > 50) {
            recommendations.push(`تم اكتشاف <strong>${total404s}</strong> خطأ 404. قم بتصدير قائمة الأخطاء من النافذة المخصصة وقم بإصلاحها.`);
        }
        if (anomalies.length > 0) {
            recommendations.push(`تم اكتشاف أنشطة غير طبيعية. يوصى بفحص عناوين IP المذكورة وحظرها إذا لزم الأمر.`);
        }

        return { anomalies, recommendations };
    }

    function displayComparisonResults(delta404, deltaBots, newPagesCount) {
        const formatDelta = (delta) => {
            if (delta > 0) return `<span class="text-danger"><i class="bi bi-arrow-up"></i> ${delta}</span>`;
            if (delta < 0) return `<span class="text-success"><i class="bi bi-arrow-down"></i> ${Math.abs(delta)}</span>`;
            return `<span>${delta}</span>`;
        };
        delta404El.innerHTML = formatDelta(delta404);
        deltaBotsEl.innerHTML = formatDelta(deltaBots);
        deltaNewPagesEl.textContent = newPagesCount;
        comparisonContainer.classList.remove('d-none');
    }

    function displayInsights(anomalies, recommendations) {
        if (anomalies.length === 0 && recommendations.length === 0) {
            insightsContainer.classList.add('d-none');
            return;
        }
        let html = '';
        if (anomalies.length > 0) {
            html += anomalies.map(anomaly => `<li class="list-group-item list-group-item-danger">${anomaly}</li>`).join('');
        }
        if (recommendations.length > 0) {
            html += recommendations.map(rec => `<li class="list-group-item list-group-item-warning">${rec}</li>`).join('');
        }
        insightsList.innerHTML = html;
        insightsContainer.classList.remove('d-none');
    }

    // --- EVENT LISTENERS ---
    document.addEventListener('analysisComplete', (event) => {
        analysisA = event.detail;
        if (comparisonDropZoneContainer) comparisonDropZoneContainer.classList.remove('d-none');
    });

    // --- THE FINAL FIX: Make the comparison drop zone a REAL drop zone ---
    if (comparisonDropZone) {
        comparisonDropZone.addEventListener('click', () => comparisonFileInput.click());
        comparisonFileInput.addEventListener('change', handleComparisonFileSelect);
        
        comparisonDropZone.addEventListener('dragenter', (e) => { e.preventDefault(); comparisonDropZone.classList.add("dragover"); });
        comparisonDropZone.addEventListener('dragover', (e) => { e.preventDefault(); comparisonDropZone.classList.add("dragover"); });
        comparisonDropZone.addEventListener('dragleave', () => comparisonDropZone.classList.remove("dragover"));
        comparisonDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            comparisonDropZone.classList.remove("dragover");
            handleComparisonFileSelect({ target: { files: e.dataTransfer.files } });
        });
    }
    
    // --- INITIALIZATION ---
    document.addEventListener('DOMContentLoaded', () => {
        initializeComparisonWorker();
    });

    // Helper functions for reading files (needed for this script)
    async function readZipFile(file) {
        const jszip = new JSZip();
        const zip = await jszip.loadAsync(file);
        const logFileObject = Object.values(zip.files).find(f => !f.dir && (f.name.endsWith('.log') || f.name.endsWith('.txt')));
        if (logFileObject) return await logFileObject.async("string");
        throw new Error("لم يتم العثور على ملف .log أو .txt داخل الملف المضغوط.");
    }
    function readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

})();
