const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer');

const TOKEN = '8716931500:AAGG-p4Q7p-RuBizZQcHznpSxDtMWnzX9Z8';
const bot = new TelegramBot(TOKEN, { polling: true });
const sessions = {};

console.log('CUHAS OSIM Bot is running...');

async function launchBrowser() {
    return puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
}

async function loginAndGo(regNo, password, url) {
    const browser = await launchBrowser();
    const page = await browser.newPage();
    await page.goto('https://osim.bugando.ac.tz/', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.type('input[type="text"]', regNo);
    await page.type('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
    if (page.url().includes('login')) {
        await browser.close();
        throw new Error('Invalid credentials');
    }
    if (url) await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    return { browser, page };
}

async function scrapeTable(page) {
    return page.evaluate(() => {
        const tables = document.querySelectorAll('table');
        if (!tables.length) return null;
        let result = '';
        tables.forEach(table => {
            const rows = table.querySelectorAll('tr');
            rows.forEach(row => {
                const cells = row.querySelectorAll('td, th');
                const line = Array.from(cells).map(c => c.innerText.trim()).filter(t => t).join(' | ');
                if (line) result += line + '\n';
            });
            result += '\n';
        });
        return result.trim() || null;
    });
}

function formatFees(raw) {
    if (!raw) return 'No fee data found.';
    const lines = raw.split('\n').filter(l => l.trim());
    let output = '💰 FEE SUMMARY\n';
    output += '─────────────────\n';
    
    lines.forEach(line => {
        if (line.includes('BALANCE')) return;
        if (line.includes('Total')) {
            output += '\n' + line + '\n';
        } else if (line.includes('Payment-Complete')) {
            output += '✅ ' + line + '\n';
        } else if (line.includes('Payment-Incomplete')) {
            output += '⚠️ ' + line + '\n';
        } else {
            output += line + '\n';
        }
    });
    return output;
}

function formatResults(raw) {
    if (!raw) return 'No results found.';
    const lines = raw.split('\n').filter(l => l.trim());
    let output = '📊 ACADEMIC RESULTS\n';
    output += '─────────────────\n';
    lines.forEach(line => {
        if (line.includes('GRADE') || line.includes('PASS') || line.includes('FAIL')) {
            output += '📝 ' + line + '\n';
        } else {
            output += line + '\n';
        }
    });
    return output;
}

function formatTimetable(raw) {
    if (!raw) return 'No timetable found.';
    const lines = raw.split('\n').filter(l => l.trim());
    let output = '📅 ACADEMIC TIMETABLE\n';
    output += '─────────────────\n';
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    lines.forEach(line => {
        const isDay = days.some(d => line.includes(d));
        if (isDay) {
            output += '\n📆 ' + line + '\n';
        } else {
            output += line + '\n';
        }
    });
    return output;
}

function chunkMessage(text, size = 4000) {
    const chunks = [];
    while (text.length > 0) {
        chunks.push(text.substring(0, size));
        text = text.substring(size);
    }
    return chunks;
}

bot.onText(/\/start|\/help/, (msg) => {
    bot.sendMessage(msg.chat.id,
`👋 Welcome to CUHAS OSIM Bot!

Send your credentials in this format:
LOGIN regNumber password

Example:
LOGIN CUHAS/BP/1234567/T/25 yourpassword

After login send:
RESULTS - Semester results
FEES - Fee balance
TIMETABLE - Class timetable
COURSEWORK - Coursework results
PROFILE - Your profile info`
    );
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    if (!text || text.startsWith('/')) return;

    if (text.toUpperCase().startsWith('LOGIN ')) {
        const parts = text.split(' ');
        if (parts.length < 3) {
            bot.sendMessage(chatId, 'Invalid format. Use: LOGIN regNumber password');
            return;
        }
        const regNo = parts[1];
        const password = parts.slice(2).join(' ');
        await bot.sendMessage(chatId, '⏳ Logging in...');
        try {
            const { browser, page } = await loginAndGo(regNo, password, null);
            const info = await page.evaluate(() => {
                const nameEl = document.querySelector('.navbar-text, h4, h3');
                return { name: nameEl ? nameEl.innerText.trim() : 'Student' };
            }).catch(() => ({ name: 'Student' }));
            await browser.close();
            sessions[chatId] = { regNo, password };
            await bot.sendMessage(chatId, `✅ Logged in successfully!\n👤 ${info.name}\n\nSend RESULTS, FEES, TIMETABLE, or COURSEWORK`);
        } catch (err) {
            await bot.sendMessage(chatId, '❌ Login failed: ' + err.message);
        }
        return;
    }

    if (!sessions[chatId]) {
        bot.sendMessage(chatId, 'Please login first. Send /start for instructions.');
        return;
    }

    const { regNo, password } = sessions[chatId];

    const commands = {
        'RESULTS': { url: 'https://osim.bugando.ac.tz/student/class/results', label: 'Fetching semester results...', format: formatResults },
        'FEES': { url: 'https://osim.bugando.ac.tz/student/finance_info', label: 'Fetching fee balance...', format: formatFees },
        'TIMETABLE': { url: 'https://osim.bugando.ac.tz/student/course_timetable', label: 'Fetching timetable...', format: formatTimetable },
        'COURSEWORK': { url: 'https://osim.bugando.ac.tz/student/class/course_work', label: 'Fetching coursework...', format: (r) => '📝 COURSEWORK\n─────────────────\n' + (r || 'No data found.') },
        'PROFILE': { url: 'https://osim.bugando.ac.tz/student/class/results', label: 'Fetching profile...', format: (r) => '👤 PROFILE\n─────────────────\n' + (r || 'No data found.') },
    };

    const cmd = commands[text.toUpperCase()];
    if (cmd) {
        await bot.sendMessage(chatId, '⏳ ' + cmd.label);
        try {
            const { browser, page } = await loginAndGo(regNo, password, cmd.url);
            const raw = await scrapeTable(page);
            await browser.close();
            const formatted = cmd.format(raw);
            const chunks = chunkMessage(formatted);
            for (const chunk of chunks) {
                await bot.sendMessage(chatId, chunk);
            }
        } catch (err) {
            await bot.sendMessage(chatId, '❌ Error: ' + err.message);
        }
        return;
    }

    bot.sendMessage(chatId, 'Unknown command. Send /start for instructions.');
});
