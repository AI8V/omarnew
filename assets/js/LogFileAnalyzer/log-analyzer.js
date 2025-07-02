// assets/js/log-analyzer.js - THE FINAL, UNBREAKABLE VERSION.

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
                filterAndDisplay(); // This is the main entry point after analysis
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
        
        if (!hasData) return; // Stop here if there's nothing to display

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
    
    function exportToCsv() {
        if (!analysisResultData || !analysisResultData.filteredData) return;
        const dataToExport = [
            ...Object.entries(analysisResultData.filteredData.pageCounts),
            ...Object.entries(analysisResultData.filteredData.notFoundCounts)
        ].sort(([,a],[,b]) => b.count - a.count);
        if(dataToExport.length === 0) {
            alert('لا توجد بيانات لتصديرها في الفلتر الحالي.');
            return;
        }
        const headers = ['URL', 'Visit_Count', 'Top_IPs'];
        const rows = dataToExport.map(([url, data]) => {
            const topIps = Object.keys(data.ips).join(';');
            const safeUrl = `"${url.replace(/"/g, '""')}"`;
            return [safeUrl, data.count, `"${topIps}"`].join(',');
        });
        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        downloadFile(blob, `log-analysis-${botFilterSelect.value}-${Date.now()}.csv`);
    }

    function exportResults() {
        if (!analysisResultData || !analysisResultData.filteredData) return;
        const exportData = {
            filter: botFilterSelect.options[botFilterSelect.selectedIndex].textContent,
            analysisDate: new Date().toISOString(),
            statistics: {
                totalHitsInFile: analysisResultData.totalHits,
                filteredHits: analysisResultData.filteredData.filteredHits,
                successHits: analysisResultData.filteredData.successHits,
                errorHits: analysisResultData.filteredData.errorHits,
            },
            topPages: Object.entries(analysisResultData.filteredData.pageCounts)
                .map(([url, data]) => ({ url, count: data.count, topIps: Object.keys(data.ips) })),
            notFoundPages: Object.entries(analysisResultData.filteredData.notFoundCounts)
                .map(([url, data]) => ({ url, count: data.count, topIps: Object.keys(data.ips) })),
            hits: Object.entries(analysisResultData.filteredData.pageCounts)
                .map(([url, data]) => ({ url: url, count: data.count }))
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        downloadFile(blob, `log-analysis-${botFilterSelect.value}-${Date.now()}.json`);
    }
    
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