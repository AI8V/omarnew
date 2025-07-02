// assets/js/log-analyzer.js - THE FINAL, PROFESSIONAL & COMPREHENSIVE EXPORT V2.0

(function() {
    'use strict';
    
    // --- DOM Elements ---
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const exportJsonBtn = document.getElementById('exportJsonBtn');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const clearBtn = document.getElementById('clearBtn');
    const botFilterSelect = document.getElementById('botFilterSelect');
    const resultsPlaceholder = document.getElementById('resultsPlaceholder');
    const resultsContainer = document.getElementById('resultsContainer');
    const totalHitsEl = document.getElementById('totalHits');
    const filteredHitsEl = document.getElementById('filteredHits');
    const filteredHitsLabel = document.getElementById('filteredHitsLabel');
    const successHitsEl = document.getElementById('successHits');
    const errorHitsEl = document.getElementById('errorHits');
    const topPagesBody = document.getElementById('topPagesBody');
    const topPagesTitle = document.getElementById('topPagesTitle');
    const show404ModalBtn = document.getElementById('show404ModalBtn');
    const notFoundPagesBody = document.getElementById('notFoundPagesBody');
    const modalUserAgent = document.getElementById('modalUserAgent');
    const copyEmailBtn = document.getElementById('copyEmailBtn');
    const emailTemplate = document.getElementById('emailTemplate');
    const dropZoneText = document.querySelector('[data-cy="dropzone-text"]');

    // --- State Variables ---
    let analysisResultData = null; 
    let crawlTrendChart, statusCodesChart;
    let logWorker;

    // --- Constants ---
    const IGNORED_EXTENSIONS_REGEX = /\.(css|js|jpg|jpeg|png|gif|svg|ico|woff|woff2|ttf|eot|xml|json|webp)$/i;
    const SESSION_STORAGE_KEY = 'logAnalyzerSession';

    // --- Chart Theme Reactivity ---
    new MutationObserver(() => {
        if (analysisResultData && analysisResultData.filteredData) {
            renderCharts(analysisResultData.filteredData);
        }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] });
    
    function initializeWorker() {
        if (!window.Worker) {
            alert("المتصفح الخاص بك لا يدعم Web Workers.");
            return;
        }
        logWorker = new Worker('../assets/js/LogFileAnalyzer/log-worker.js');
        logWorker.onmessage = function(event) {
            const { type, progress, result, error } = event.data;
            if (type === 'progress') {
                setLoadingState(true, `جاري التحليل... (${Math.round(progress)}%)`);
            } else if (type === 'complete') {
                const analysisEvent = new CustomEvent('analysisComplete', { detail: result });
                document.dispatchEvent(analysisEvent);
                analysisResultData = result;
                setLoadingState(false, 'اكتمل التحليل بنجاح!');
                filterAndDisplay();
            } else if (error) {
                handleError(error);
            }
        };
    }

    function handleError(errorMessage) {
        console.error("Analysis Error:", errorMessage);
        alert(`حدث خطأ: ${errorMessage}`);
        resetUI(true);
    }

    function resetUI(fullReset = false) {
        if (fullReset) sessionStorage.removeItem(SESSION_STORAGE_KEY);
        analysisResultData = null;
        resultsContainer.classList.add('d-none');
        clearBtn.classList.add('d-none');
        resultsPlaceholder.classList.remove('d-none');
        document.getElementById('comparison-container')?.classList.add('d-none');
        document.getElementById('insights-container')?.classList.add('d-none');
        document.getElementById('comparison-drop-zone-container')?.classList.add('d-none');
        totalHitsEl.textContent = '0';
        filteredHitsEl.textContent = '0';
        successHitsEl.textContent = '0';
        errorHitsEl.textContent = '0';
        topPagesBody.innerHTML = '';
        notFoundPagesBody.innerHTML = '';
        if(show404ModalBtn) show404ModalBtn.classList.add('d-none');
        [exportJsonBtn, exportCsvBtn].forEach(btn => {
            if(btn) { btn.disabled = true; btn.classList.add('disabled'); }
        });
        if (crawlTrendChart) { crawlTrendChart.destroy(); crawlTrendChart = null; }
        if (statusCodesChart) { statusCodesChart.destroy(); statusCodesChart = null; }
        if (fileInput) fileInput.value = '';
        if (dropZoneText) dropZoneText.textContent = 'اسحب وأفلت ملف السجل هنا';
    }

    function setLoadingState(isLoading, message = 'جاري التحليل...') {
        if (dropZoneText) dropZoneText.textContent = message;
        [exportJsonBtn, exportCsvBtn, clearBtn].forEach(btn => {
            if(btn) btn.disabled = isLoading;
        });
    }

    async function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        resetUI(true);
        setLoadingState(true, `جاري قراءة: ${file.name}`);
        try {
            const fileContent = file.name.endsWith('.zip') ? await readZipFile(file) : await readFileContent(file);
            if (logWorker) {
                 setLoadingState(true, 'بدء التحليل...');
                 logWorker.postMessage(fileContent);
            }
        } catch (error) {
            handleError(error.message);
        }
    }

    function filterAndDisplay() {
        if (!analysisResultData) return;
        const filterValue = botFilterSelect.value;
        const data = {
            filteredHits: 0, errorHits: 0, successHits: 0,
            pageCounts: {}, dailyCounts: {}, statusCounts: {}, notFoundCounts: {}
        };
        analysisResultData.allParsedLines.forEach(line => {
            let filterMatch = false;
            const isVerifiedBot = line.botType !== 'Other' && line.isVerified;
            switch (filterValue) {
                case 'all': filterMatch = true; break;
                case 'googlebot': filterMatch = line.botType.startsWith('Googlebot') && line.isVerified; break;
                case 'bots': filterMatch = isVerifiedBot; break;
                case 'other': filterMatch = line.botType === 'Other' || !line.isVerified; break;
                default: filterMatch = line.botType.toLowerCase() === filterValue.toLowerCase() && line.isVerified; break;
            }
            if (filterMatch) {
                data.filteredHits++;
                data.dailyCounts[line.date] = (data.dailyCounts[line.date] || 0) + 1;
                const statusCode = line.statusCode;
                if (statusCode >= 200 && statusCode < 300) data.successHits++;
                if (statusCode >= 400) data.errorHits++;
                const statusFamily = `${Math.floor(statusCode / 100)}xx`;
                data.statusCounts[statusFamily] = (data.statusCounts[statusFamily] || 0) + 1;
                if (!IGNORED_EXTENSIONS_REGEX.test(line.request) && line.request && line.request !== '*') {
                    const page = line.request.split('?')[0];
                    const targetGroup = (statusCode === 404) ? data.notFoundCounts : data.pageCounts;
                    if (!targetGroup[page]) { targetGroup[page] = { count: 0, ips: {} }; }
                    targetGroup[page].count++;
                    targetGroup[page].ips[line.ip] = (targetGroup[page].ips[line.ip] || 0) + 1;
                }
            }
        });
        analysisResultData.filteredData = data;
        saveSession();
        displayResults();
    }
    
    function displayResults() {
        if (!analysisResultData || !analysisResultData.filteredData) return;
        const { filteredData, totalHits } = analysisResultData;
        const selectedOptionText = botFilterSelect.options[botFilterSelect.selectedIndex].textContent;
        const hasData = totalHits > 0;
        
        [exportJsonBtn, exportCsvBtn].forEach(btn => {
            if(btn) { btn.disabled = !hasData; btn.classList.toggle('disabled', !hasData); }
        });
        if(clearBtn) { clearBtn.disabled = !hasData; clearBtn.classList.toggle('d-none', !hasData); }
        resultsPlaceholder.classList.toggle('d-none', hasData);
        resultsContainer.classList.toggle('d-none', !hasData);
        if (!hasData) return; 

        totalHitsEl.textContent = totalHits.toLocaleString();
        filteredHitsEl.textContent = filteredData.filteredHits.toLocaleString();
        filteredHitsLabel.textContent = selectedOptionText;
        successHitsEl.textContent = filteredData.successHits.toLocaleString();
        errorHitsEl.textContent = filteredData.errorHits.toLocaleString();
        topPagesTitle.textContent = `أهم الصفحات التي زارها ${selectedOptionText}`;
        const sortedPages = Object.entries(filteredData.pageCounts).sort(([, a], [, b]) => b.count - a.count).slice(0, 25);
        topPagesBody.innerHTML = sortedPages.length > 0
            ? sortedPages.map(([page, pageData], index) => {
                const topIps = Object.entries(pageData.ips).sort(([, a], [, b]) => b - a).slice(0, 3).map(([ip, count]) => `${ip} <span class="badge bg-secondary-subtle text-secondary-emphasis rounded-pill">${count}</span>`).join('<br>');
                return `<tr><td>${index + 1}</td><td class="text-start" dir="ltr">${page}</td><td class="text-center">${pageData.count.toLocaleString()}</td><td class="text-center" dir="ltr">${topIps || ''}</td></tr>`;
            }).join('')
            : `<tr><td colspan="4" class="text-center text-muted">لم يتم العثور على زيارات مطابقة لهذا الفلتر.</td></tr>`;
        const sortedNotFound = Object.entries(filteredData.notFoundCounts).sort(([, a], [, b]) => b.count - a.count);
        if (show404ModalBtn) {
            const has404 = sortedNotFound.length > 0;
            show404ModalBtn.classList.toggle('d-none', !has404);
            if(has404) {
                modalUserAgent.textContent = selectedOptionText;
                notFoundPagesBody.innerHTML = sortedNotFound.map(([page, pageData], index) => 
                    `<tr><td>${index + 1}</td><td class="text-start" dir="ltr">${page}</td><td class="text-center">${pageData.count.toLocaleString()}</td></tr>`
                ).join('');
            }
        }
        renderCharts(filteredData);
    }
    
    function saveSession() {
        if (!analysisResultData) return;
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ analysisResultData, filterValue: botFilterSelect.value }));
    }

    function loadSession() {
        const savedSession = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (savedSession) {
            try {
                const session = JSON.parse(savedSession);
                analysisResultData = session.analysisResultData;
                botFilterSelect.value = session.filterValue;
                setLoadingState(false, 'تم استعادة الجلسة السابقة');
                const analysisEvent = new CustomEvent('analysisComplete', { detail: analysisResultData });
                document.dispatchEvent(analysisEvent);
                filterAndDisplay();
            } catch (e) { handleError("فشل تحميل الجلسة السابقة."); }
        }
    }

    function downloadFile(blob, fileName) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 100);
    }
    
    // ===================================================================
    // FINALIZED INTELLIGENCE EXPORT FUNCTIONS V2.0
    // ===================================================================
    function getFullAnalysisData() {
        if (!analysisResultData || !analysisResultData.filteredData) return null;
        
        const { allParsedLines, filteredData, totalHits } = analysisResultData;
        const selectedOptionText = botFilterSelect.options[botFilterSelect.selectedIndex].textContent;

        // Bot Analysis (on the whole file)
        const botTraffic = {};
        allParsedLines.forEach(line => {
            const botKey = line.botType === 'Other' ? 'Other/Unknown' : line.botType;
            botTraffic[botKey] = (botTraffic[botKey] || 0) + 1;
        });
        const botAnalysis_InFile = Object.entries(botTraffic)
            .sort(([, a], [, b]) => b - a)
            .map(([bot, count]) => ({ bot, count, percentage: ((count / totalHits) * 100).toFixed(2) + '%' }));

        // Data based on the current filter
        const topCrawledPages_ForFilter = Object.entries(filteredData.pageCounts).sort(([,a],[,b]) => b.count-a.count).map(([url, data]) => ({ url, hits: data.count, topIps: Object.keys(data.ips) }));
        const top404Errors_ForFilter = Object.entries(filteredData.notFoundCounts).sort(([,a],[,b]) => b.count-a.count).map(([url, data]) => ({ url, hits: data.count, topIps: Object.keys(data.ips) }));
        const dailyActivity_ForFilter = Object.entries(filteredData.dailyCounts).sort(([a], [b]) => new Date(a.replace(/\//g, ' ')) - new Date(b.replace(/\//g, ' '))).map(([date, hits]) => ({ date, hits }));
        
        // Data for integration
        const crawlData_ForIntegration = topCrawledPages_ForFilter.map(({ url, hits }) => ({ url, count: hits }));

        // Metadata
        const dates = allParsedLines.map(l => l.date).filter(Boolean);
        const startDate = dates.length > 0 ? dates[0] : 'N/A';
        const endDate = dates.length > 0 ? dates[dates.length - 1] : 'N/A';

        return {
            metadata: {
                reportTitle: `تحليل لـ: ${selectedOptionText}`,
                analysisDate: new Date().toISOString(),
                logFileTimeRange: `${startDate} to ${endDate}`
            },
            statistics_ForFilter: {
                totalHitsInFile: totalHits,
                filteredHits: filteredData.filteredHits,
                successHits: filteredData.successHits,
                errorHits: filteredData.errorHits
            },
            botAnalysis_InFile,
            dailyActivity_ForFilter,
            topCrawledPages_ForFilter,
            top404Errors_ForFilter,
            crawlData_ForIntegration
        };
    }

    function exportResults() { // JSON Export
        const data = getFullAnalysisData();
        if (!data) return alert('لا توجد بيانات للتحليل والتصدير.');
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        downloadFile(blob, `log_analysis_report_${botFilterSelect.value}_${Date.now()}.json`);
    }
    
    async function exportToCsv() { // ZIP of CSVs Export
        const data = getFullAnalysisData();
        if (!data) return alert('لا توجد بيانات للتحليل والتصدير.');
        const zip = new JSZip();

        // Sheet 1: Summary
        zip.file("01_summary.csv", "\uFEFF" + [
            `Metric,Value`,
            `Report For,"${data.metadata.reportTitle}"`,
            `Total Requests In File,"${data.statistics_ForFilter.totalHitsInFile}"`,
            `Filtered Requests,"${data.statistics_ForFilter.filteredHits}"`,
            `Analysis Period,"${data.metadata.logFileTimeRange}"`,
        ].join('\n'));

        // Sheet 2: Bot Traffic Overview (from whole file)
        zip.file("02_bot_traffic_overview.csv", "\uFEFF" + [
            `Bot,Total_Hits,Percentage_Of_Total`,
            ...data.botAnalysis_InFile.map(row => `${row.bot},${row.count},${row.percentage}`)
        ].join('\n'));
        
        // Sheet 3: Top Pages (for the current filter)
        zip.file("03_top_pages_(filtered).csv", "\uFEFF" + [
            `URL,Hits`,
            ...data.topCrawledPages_ForFilter.map(row => `"${row.url.replace(/"/g, '""')}",${row.hits}`)
        ].join('\n'));
        
        // Sheet 4: 404 Errors (for the current filter)
        if (data.top404Errors_ForFilter.length > 0) {
            zip.file("04_404_errors_(filtered).csv", "\uFEFF" + [
                `URL,404_Hits`,
                ...data.top404Errors_ForFilter.map(row => `"${row.url.replace(/"/g, '""')}",${row.hits}`)
            ].join('\n'));
        }

        // Sheet 5: Daily Activity (for the current filter)
        zip.file("05_daily_activity_(filtered).csv", "\uFEFF" + [
            `Date,Hits`,
            ...data.dailyActivity_ForFilter.map(row => `${row.date},${row.hits}`)
        ].join('\n'));

        const content = await zip.generateAsync({ type: "blob" });
        downloadFile(content, `log_analysis_sheets_${botFilterSelect.value}_${Date.now()}.zip`);
    }
    
    // ... (rest of the file remains the same) ...
    function handleCopyEmail(){if(!emailTemplate||!copyEmailBtn)return;const e=emailTemplate.value;navigator.clipboard&&window.isSecureContext?navigator.clipboard.writeText(e).then(showCopySuccess,showCopyError):(()=>{const t=document.createElement("textarea");t.value=e,t.style.position="absolute",t.style.left="-9999px",document.body.appendChild(t),t.select();try{document.execCommand("copy"),showCopySuccess()}catch(e){showCopyError(e)}finally{document.body.removeChild(t)}})()}
    function showCopySuccess(){const e=copyEmailBtn.innerHTML;copyEmailBtn.disabled=!0,copyEmailBtn.innerHTML='<i class="bi bi-check-lg ms-1"></i> تم النسخ بنجاح!',copyEmailBtn.classList.remove("btn-secondary"),copyEmailBtn.classList.add("btn-success"),setTimeout(()=>{copyEmailBtn.innerHTML=e,copyEmailBtn.disabled=!1,copyEmailBtn.classList.remove("btn-success"),copyEmailBtn.classList.add("btn-secondary")},2e3)}
    function showCopyError(e){console.error("فشل في نسخ النص:",e),alert("عذراً، لم نتمكن من نسخ النص تلقائياً.")}
    async function readZipFile(e){const t=new JSZip,o=await t.loadAsync(e);return(Object.values(o.files).find(e=>!e.dir&&(e.name.endsWith(".log")||e.name.endsWith(".txt")))?.async("string"))??(function(){throw new Error("لم يتم العثور على ملف .log أو .txt داخل الملف المضغوط.")}())}
    function readFileContent(e){return new Promise((t,o)=>{const n=new FileReader;n.onload=e=>t(e.target.result),n.onerror=o,n.readAsText(e)})}
    function renderCharts(e){if(!e||!document.getElementById("crawlTrendChart")||!document.getElementById("statusCodesChart"))return;const t=getComputedStyle(document.documentElement).getPropertyValue("--bs-body-color"),o=getComputedStyle(document.documentElement).getPropertyValue("--bs-border-color-translucent");crawlTrendChart&&crawlTrendChart.destroy();const n=Object.keys(e.dailyCounts).sort(((t,e)=>new Date(t.replace(/\//g," "))-new Date(e.replace(/\//g," "))));crawlTrendChart=new Chart(document.getElementById("crawlTrendChart").getContext("2d"),{type:"line",data:{labels:n,datasets:[{label:"عدد الزيارات",data:n.map((t=>e.dailyCounts[t])),borderColor:"#0dcaf0",backgroundColor:"rgba(13, 202, 240, 0.2)",fill:!0,tension:.3}]},options:{scales:{y:{beginAtZero:!0,ticks:{color:t,precision:0},grid:{color:o}},x:{ticks:{color:t},grid:{color:o}}},plugins:{legend:{display:!1}}}}),statusCodesChart&&statusCodesChart.destroy();const s={2xx:0,3xx:0,4xx:0,"5xx":0,...e.statusCounts};statusCodesChart=new Chart(document.getElementById("statusCodesChart").getContext("2d"),{type:"doughnut",data:{labels:["نجاح (2xx)","إعادة توجيه (3xx)","خطأ عميل (4xx)","خطأ خادم (5xx)"],datasets:[{data:[s["2xx"],s["3xx"],s["4xx"],s["5xx"]],backgroundColor:["#198754","#ffc107","#fd7e14","#dc3545"]}]},options:{responsive:!0,plugins:{legend:{position:"bottom",labels:{color:t,padding:15}}}}})}
    document.addEventListener('DOMContentLoaded', () => {
        initializeWorker();
        loadSession(); 
        if(dropZone) {
            dropZone.addEventListener('click', () => fileInput.click());
            dropZone.addEventListener('dragenter', (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
            dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
            dropZone.addEventListener('dragleave', () => dropZone.classList.remove("dragover"));
            dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove("dragover"); handleFileSelect({ target: { files: e.dataTransfer.files } }); });
        }
        if(fileInput) fileInput.addEventListener('change', handleFileSelect);
        if(exportJsonBtn) exportJsonBtn.addEventListener('click', exportResults);
        if(exportCsvBtn) exportCsvBtn.addEventListener('click', exportToCsv);
        if(clearBtn) clearBtn.addEventListener('click', () => resetUI(true));
        if(botFilterSelect) botFilterSelect.addEventListener('change', () => { if (analysisResultData) filterAndDisplay(); });
        if(copyEmailBtn) copyEmailBtn.addEventListener('click', handleCopyEmail);
    });

})();
