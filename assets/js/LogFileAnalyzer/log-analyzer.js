// assets/js/log-analyzer.js - THE FINAL, PROFESSIONAL EXPORT UPDATE (PHASE II: INTELLIGENCE UPGRADE)

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
        if (fullReset) {
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
        }
        analysisResultData = null;
        resultsContainer.classList.add('d-none');
        clearBtn.classList.add('d-none');
        resultsPlaceholder.classList.remove('d-none');
        
        totalHitsEl.textContent = '0';
        filteredHitsEl.textContent = '0';
        successHitsEl.textContent = '0';
        errorHitsEl.textContent = '0';
        topPagesBody.innerHTML = '';
        notFoundPagesBody.innerHTML = '';
        if(show404ModalBtn) show404ModalBtn.classList.add('d-none');

        [exportJsonBtn, exportCsvBtn].forEach(btn => {
            if(btn) {
                btn.disabled = true;
                btn.classList.add('disabled');
            }
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
            pageCounts: {}, dailyCounts: {}, statusCounts: {}, notFoundCounts: {},
            statusCodeBreakdown: {} // ✅ UPGRADE: Add status code breakdown
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
                
                // ✅ UPGRADE: Populate status code breakdown
                data.statusCodeBreakdown[statusCode] = (data.statusCodeBreakdown[statusCode] || 0) + 1;

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
            if(btn) {
                btn.disabled = !hasData;
                btn.classList.toggle('disabled', !hasData);
            }
        });
        if(clearBtn) {
            clearBtn.disabled = !hasData;
            clearBtn.classList.toggle('d-none', !hasData);
        }

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
        const session = {
            analysisResultData: analysisResultData,
            filterValue: botFilterSelect.value
        };
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    }

    function loadSession() {
        const savedSession = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (savedSession) {
            try {
                const session = JSON.parse(savedSession);
                analysisResultData = session.analysisResultData;
                botFilterSelect.value = session.filterValue;
                setLoadingState(false, 'تم استعادة الجلسة السابقة');
                filterAndDisplay();
            } catch (e) {
                handleError("فشل تحميل الجلسة السابقة.");
            }
        }
    }

    function downloadFile(blob, fileName) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
        }, 100);
    }
    
    // ===================================================================
    // UPGRADED INTELLIGENCE EXPORT FUNCTIONS (PHASE II)
    // ===================================================================

    function getFullAnalysisData() {
        if (!analysisResultData || !analysisResultData.filteredData) return null;

        const { allParsedLines, filteredData, totalHits } = analysisResultData;
        const selectedOptionText = botFilterSelect.options[botFilterSelect.selectedIndex].textContent;

        // --- Metadata and Time Range ---
        const dates = allParsedLines.map(l => l.date).filter(Boolean);
        const sortedUniqueDates = [...new Set(dates)].sort((a,b) => new Date(a.replace(/\//g, ' ')) - new Date(b.replace(/\//g, ' ')));
        const startDate = sortedUniqueDates.length > 0 ? sortedUniqueDates[0] : 'N/A';
        const endDate = sortedUniqueDates.length > 0 ? sortedUniqueDates[sortedUniqueDates.length - 1] : 'N/A';

        const metadata = {
            reportTitle: `تحليل لـ: ${selectedOptionText}`,
            analysisDate: new Date().toISOString(),
            logFileTimeRange: `${startDate} to ${endDate}`
        };

        // --- Statistics for the current filter (UPGRADED) ---
        const statistics_ForFilter = {
            totalHitsInFile: totalHits,
            filteredHits: filteredData.filteredHits,
            successHits: filteredData.successHits,
            errorHits: filteredData.errorHits,
            // ✅ UPGRADE: Calculate crawl budget waste
            crawlWastePercentage: filteredData.filteredHits > 0 ? 
                ((filteredData.errorHits / filteredData.filteredHits) * 100).toFixed(2) + '%' 
                : '0.00%'
        };
        
        // --- ✅ UPGRADE: Granular status code breakdown for the filter ---
        const statusCodeBreakdown_ForFilter = filteredData.statusCodeBreakdown || {};
        
        // --- Bot Analysis for the ENTIRE file (No Change) ---
        const botTraffic = {};
        allParsedLines.forEach(line => {
            const botKey = line.isVerified ? line.botType : `Unverified-${line.botType}`;
            botTraffic[botKey] = (botTraffic[botKey] || 0) + 1;
        });
        const botAnalysis_InFile = Object.entries(botTraffic)
            .sort(([, a], [, b]) => b - a)
            .map(([bot, count]) => ({ bot, count, percentage: ((count / totalHits) * 100).toFixed(2) + '%' }));

        // --- Daily Activity for the current filter (No Change) ---
        const dailyActivity_ForFilter = Object.entries(filteredData.dailyCounts)
            .sort(([a], [b]) => new Date(a.replace(/\//g, ' ')) - new Date(b.replace(/\//g, ' ')))
            .map(([date, hits]) => ({ date, hits }));

        // --- Helper to process page data with IPs (No Change) ---
        const processPageData = (pageDataObject) => {
            return Object.entries(pageDataObject)
                .sort(([, a], [, b]) => b.count - a.count)
                .map(([url, data]) => ({
                    url,
                    hits: data.count,
                    topIps: Object.entries(data.ips)
                                 .sort(([, a], [, b]) => b - a)
                                 .slice(0, 5)
                                 .map(([ip, count]) => `${ip} (${count})`)
                }));
        };

        const topCrawledPages_ForFilter = processPageData(filteredData.pageCounts);
        const top404Errors_ForFilter = processPageData(filteredData.notFoundCounts);
        
        const crawlData_ForIntegration = topCrawledPages_ForFilter.map(({ url, hits }) => ({ url, count: hits }));

        // --- ✅ UPGRADE: IP-Centric Analysis for the ENTIRE file ---
        const ipAnalysis = {};
        allParsedLines.forEach(line => {
            if (!line.ip) return;
            if (!ipAnalysis[line.ip]) {
                ipAnalysis[line.ip] = {
                    ip: line.ip,
                    totalHits: 0,
                    associatedBots: new Set(),
                    requests: []
                };
            }
            ipAnalysis[line.ip].totalHits++;
            const botKey = line.isVerified ? line.botType : `Unverified-${line.botType}`;
            ipAnalysis[line.ip].associatedBots.add(botKey);
            ipAnalysis[line.ip].requests.push(line.request.split('?')[0]);
        });

        const ipAnalysis_InFile = Object.values(ipAnalysis)
            .sort((a, b) => b.totalHits - a.totalHits)
            .slice(0, 25) // Limit to top 25 IPs for performance
            .map(ipData => {
                const requestCounts = ipData.requests.reduce((acc, req) => {
                    acc[req] = (acc[req] || 0) + 1;
                    return acc;
                }, {});
                const topRequests = Object.entries(requestCounts)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5)
                    .map(([req]) => req);

                return {
                    ip: ipData.ip,
                    totalHits: ipData.totalHits,
                    associatedBots: [...ipData.associatedBots],
                    topRequests: topRequests
                };
            });

        return {
            metadata,
            statistics_ForFilter,
            botAnalysis_InFile,
            ipAnalysis_InFile, // New Section
            statusCodeBreakdown_ForFilter, // New Section
            dailyActivity_ForFilter,
            topCrawledPages_ForFilter,
            top404Errors_ForFilter,
            crawlData_ForIntegration
        };
    }

    function exportResults() { // JSON Export
        const data = getFullAnalysisData();
        if (!data) {
            alert('لا توجد بيانات للتحليل والتصدير.');
            return;
        }
        const filterName = botFilterSelect.value.replace(/[^a-z0-9]/gi, '_');
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        downloadFile(blob, `full_log_analysis_report_${filterName}_${Date.now()}.json`);
    }
    
    async function exportToCsv() { // ZIP of CSVs Export (UPGRADED)
        const data = getFullAnalysisData();
        if (!data) {
            alert('لا توجد بيانات للتحليل والتصدير.');
            return;
        }
        
        const zip = new JSZip();
        const BOM = "\uFEFF";

        // Sheet 1: Summary (Upgraded)
        let summaryCsv = `Metric,Value\n`;
        summaryCsv += `Report Title,"${data.metadata.reportTitle}"\n`;
        summaryCsv += `Analysis Date,"${data.metadata.analysisDate}"\n`;
        summaryCsv += `Log File Time Range,"${data.metadata.logFileTimeRange}"\n`;
        summaryCsv += `Total Hits In File,"${data.statistics_ForFilter.totalHitsInFile}"\n`;
        summaryCsv += `Filtered Hits,"${data.statistics_ForFilter.filteredHits}"\n`;
        summaryCsv += `Success Hits (Filtered),"${data.statistics_ForFilter.successHits}"\n`;
        summaryCsv += `Error Hits (Filtered),"${data.statistics_ForFilter.errorHits}"\n`;
        summaryCsv += `Crawl Waste Percentage (Filtered),"${data.statistics_ForFilter.crawlWastePercentage}"\n`;
        zip.file("01_summary.csv", BOM + summaryCsv);

        // Sheet 2: Bot Traffic (Entire File)
        let botCsv = `Bot,Count,Percentage\n`;
        data.botAnalysis_InFile.forEach(row => {
            botCsv += `"${row.bot}",${row.count},"${row.percentage}"\n`;
        });
        zip.file("02_bot_analysis_infile.csv", BOM + botCsv);
        
        // Sheet 3: IP Centric Analysis (New)
        if(data.ipAnalysis_InFile.length > 0) {
            let ipCsv = `IP,Total Hits,Associated Bots,Top Requests\n`;
            data.ipAnalysis_InFile.forEach(row => {
                ipCsv += `"${row.ip}",${row.totalHits},"${row.associatedBots.join(', ')}","${row.topRequests.join(', ')}"\n`;
            });
            zip.file("03_ip_centric_analysis.csv", BOM + ipCsv);
        }

        // Sheet 4: Status Code Breakdown (New)
        if(Object.keys(data.statusCodeBreakdown_ForFilter).length > 0){
            let statusCsv = `Status Code,Count\n`;
            Object.entries(data.statusCodeBreakdown_ForFilter).forEach(([code, count]) => {
                statusCsv += `${code},${count}\n`;
            });
            zip.file("04_status_code_breakdown.csv", BOM + statusCsv);
        }
        
        // Sheet 5: Daily Activity (Filtered)
        if (data.dailyActivity_ForFilter.length > 0) {
            let dailyCsv = `Date,Hits\n`;
            data.dailyActivity_ForFilter.forEach(row => {
                dailyCsv += `${row.date},${row.hits}\n`;
            });
            zip.file("05_daily_activity_filtered.csv", BOM + dailyCsv);
        }
        
        // Sheet 6: Top Crawled Pages (Filtered)
        if (data.topCrawledPages_ForFilter.length > 0) {
            let pagesCsv = `URL,Hits,Top IPs\n`;
            data.topCrawledPages_ForFilter.forEach(row => {
                pagesCsv += `"${row.url}",${row.hits},"${row.topIps.join(', ')}"\n`;
            });
            zip.file("06_top_pages_filtered.csv", BOM + pagesCsv);
        }

        // Sheet 7: 404 Errors (Filtered)
        if (data.top404Errors_ForFilter.length > 0) {
            let errorsCsv = `URL,Hits,Top IPs\n`;
            data.top404Errors_ForFilter.forEach(row => {
                errorsCsv += `"${row.url}",${row.hits},"${row.topIps.join(', ')}"\n`;
            });
            zip.file("07_404_errors_filtered.csv", BOM + errorsCsv);
        }
        
        const filterName = botFilterSelect.value.replace(/[^a-z0-9]/gi, '_');
        const content = await zip.generateAsync({ type: "blob" });
        downloadFile(content, `log_analysis_report_${filterName}_${Date.now()}.zip`);
    }
    
    // ===================================================================

    function handleCopyEmail() {
        if (!emailTemplate || !copyEmailBtn) return;
        const textToCopy = emailTemplate.value;
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(textToCopy).then(showCopySuccess, showCopyError);
        } else {
            const textArea = document.createElement('textarea');
            textArea.value = textToCopy;
            textArea.style.position = 'absolute';
            textArea.style.left = '-9999px';
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                showCopySuccess();
            } catch (err) {
                showCopyError(err);
            } finally {
                document.body.removeChild(textArea);
            }
        }
    }

    function showCopySuccess() {
        const originalContent = copyEmailBtn.innerHTML;
        copyEmailBtn.disabled = true;
        copyEmailBtn.innerHTML = `<i class="bi bi-check-lg ms-1"></i> تم النسخ بنجاح!`;
        copyEmailBtn.classList.remove('btn-secondary');
        copyEmailBtn.classList.add('btn-success');
        setTimeout(() => {
            copyEmailBtn.innerHTML = originalContent;
            copyEmailBtn.disabled = false;
            copyEmailBtn.classList.remove('btn-success');
            copyEmailBtn.classList.add('btn-secondary');
        }, 2000);
    }

    function showCopyError(err) {
         console.error('فشل في نسخ النص:', err);
         alert('عذراً، لم نتمكن من نسخ النص تلقائياً.');
    }
    
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

    function renderCharts(data) {
        if (!data || !document.getElementById('crawlTrendChart') || !document.getElementById('statusCodesChart')) return;
        const textColor = getComputedStyle(document.documentElement).getPropertyValue('--bs-body-color');
        const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--bs-border-color-translucent');
        
        if (crawlTrendChart) crawlTrendChart.destroy();
        const sortedDays = Object.keys(data.dailyCounts).sort((a,b) => new Date(a.replace(/\//g, ' ')) - new Date(b.replace(/\//g, ' ')));
        crawlTrendChart = new Chart(document.getElementById('crawlTrendChart').getContext('2d'), {
            type: 'line', data: { labels: sortedDays, datasets: [{ label: 'عدد الزيارات', data: sortedDays.map(day => data.dailyCounts[day]), borderColor: '#0dcaf0', backgroundColor: 'rgba(13, 202, 240, 0.2)', fill: true, tension: 0.3 }] },
            options: { scales: { y: { beginAtZero: true, ticks: { color: textColor, precision: 0 }, grid: { color: gridColor } }, x: { ticks: { color: textColor }, grid: { color: gridColor } } }, plugins: { legend: { display: false } } }
        });

        if(statusCodesChart) statusCodesChart.destroy();
        const statusData = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, ...data.statusCounts };
        statusCodesChart = new Chart(document.getElementById('statusCodesChart').getContext('2d'), {
            type: 'doughnut', data: { labels: ['نجاح (2xx)', 'إعادة توجيه (3xx)', 'خطأ عميل (4xx)', 'خطأ خادم (5xx)'], datasets: [{ data: [statusData['2xx'], statusData['3xx'], statusData['4xx'], statusData['5xx']], backgroundColor: ['#198754', '#ffc107', '#fd7e14', '#dc3545'] }] },
            options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: textColor, padding: 15 } } } }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        initializeWorker();
        loadSession(); 
        
        if(dropZone) {
            dropZone.addEventListener('click', () => fileInput.click());
            dropZone.addEventListener('dragenter', (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
            dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
            dropZone.addEventListener('dragleave', () => dropZone.classList.remove("dragover"));
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove("dragover");
                handleFileSelect({ target: { files: e.dataTransfer.files } });
            });
        }

        if(fileInput) fileInput.addEventListener('change', handleFileSelect);
        if(exportJsonBtn) exportJsonBtn.addEventListener('click', exportResults);
        if(exportCsvBtn) exportCsvBtn.addEventListener('click', exportToCsv);
        if(clearBtn) clearBtn.addEventListener('click', () => resetUI(true));
        if(botFilterSelect) botFilterSelect.addEventListener('change', () => { if (analysisResultData) filterAndDisplay(); });
        if(copyEmailBtn) copyEmailBtn.addEventListener('click', handleCopyEmail);
    });

})();
