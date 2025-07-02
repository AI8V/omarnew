// assets/js/log-worker.js

function verifyBot(ip) {
    if (!ip) return false;
    if (ip.startsWith('66.249.') || ip.startsWith('74.125.')) return true;
    if (ip.startsWith('157.55.')) return true;
    if (ip.startsWith('8.8.8.8') || ip.startsWith('1.1.1.1')) return false;
    return true;
}

function classifyUserAgent(uaString) {
    if (!uaString || uaString === '-') return 'Other';
    const ua = uaString.toLowerCase();
    if (ua.includes('google-inspectiontool')) return 'Google-InspectionTool';
    if (ua.includes('googlebot-image')) return 'Googlebot-Image';
    if (ua.includes('googlebot-video')) return 'Googlebot-Video';
    if (ua.includes('googlebot')) { return ua.includes('mobile') ? 'Googlebot-Mobile' : 'Googlebot-Desktop'; }
    if (ua.includes('bingbot')) return 'Bingbot';
    if (ua.includes('yandex')) return 'YandexBot';
    if (ua.includes('duckduckbot')) return 'DuckDuckBot';
    if (ua.includes('ahrefsbot')) return 'AhrefsBot';
    if (ua.includes('semrushbot')) return 'SemrushBot';
    if (ua.includes('bot') || ua.includes('spider') || ua.includes('crawler')) return 'bots';
    return 'Other';
}

// --- START: Export for Unit Tests ---
if (typeof self.window !== 'undefined' && typeof self.window.document !== 'undefined') {
    self.window.logAnalyzerForTests = {
        classifyUserAgent,
        verifyBot
    };
}
// --- END: Export for Unit Tests ---

if (typeof self.document === 'undefined') { // Only run this part inside the actual worker
    const LOG_FORMAT_REGEX = /^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) \S+" (\d{3}) \S+ "([^"]*)" "([^"]*)"/;

    self.onmessage = function(event) {
        const fileContent = event.data;
        if (!fileContent) {
            self.postMessage({ type: 'error', error: "File content is empty." });
            return;
        }

        const lines = fileContent.split('\n');
        const totalLines = lines.length;
        let processedLines = 0;

        const allParsedLines = lines.map(line => {
            processedLines++;
            
            if (processedLines % 5000 === 0) { // Report progress less frequently
                self.postMessage({ type: 'progress', progress: (processedLines / totalLines) * 100 });
            }
            
            if (line.trim() === '') return null;

            const match = line.match(LOG_FORMAT_REGEX);
            if (!match) return null;

            const ip = match[1];
            const userAgent = match[7] || "";

            return {
                ip,
                botType: classifyUserAgent(userAgent),
                isVerified: verifyBot(ip),
                date: match[2].split(':')[0],
                request: match[4],
                statusCode: parseInt(match[5], 10),
            };
        }).filter(Boolean);

        self.postMessage({ 
            type: 'complete', 
            result: {
                allParsedLines, 
                totalHits: allParsedLines.length
            }
        });
    };
}