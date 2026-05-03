const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer');

const TOKEN = '8716931500:AAGG-p4Q7p-RuBizZQcHznpSxDtMWnzX9Z8';
const bot = new TelegramBot(TOKEN, { polling: true });

const sessions = {};

console.log('🤖 CUHAS OSIM Bot is running...');

bot.onText(/\/start|\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId,
`👋 *Welcome to CUHAS OSIM Bot!*

I can fetch your academic information from OSIM.

Send your credentials using this format:
\`LOGIN regNumber password\`

*Example:*
\`LOGIN CUHAS/BP/1234567/T/25 yourpassword\`

⚠️ Your credentials are used only to fetch your data and are never stored.`, 
    { parse_mode: 'Markdown' });
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();

    if (!text || text.startsWith('/')) return;

    // LOGIN command
    if (text.toUpperCase().startsWith('LOGIN ')) {
        const parts = text.split(' ');
        if (parts.length < 3) {
            bot.sendMessage(chatId, '❌ Invalid format. Use:\n`LOGIN regNumber password`', { parse_mode: 'Markdown' });
            return;
        }

        const regNo = parts[1];
        const password = parts.slice(2).join(' ');

        await bot.sendMessage(chatId, '⏳ Logging into OSIM, please wait...');

        try {
            const result = await loginOSIM(regNo, password);
            sessions[chatId] = { regNo, password, page: null };
            await bot.sendMessage(chatId, result, { parse_mode: 'Markdown' });
        } catch (err) {
            await bot.sendMessage(chatId, `❌ Failed: ${err.message}`);
        }
        return;
    }

    // RESULTS command
    if (text.toUpperCase() === 'RESULTS') {
        if (!sessions[chatId]) {
            bot.sendMessage(chatId, '⚠️ Please login first using:\n`LOGIN regNumber password`', { parse_mode: 'Markdown' });
            return;
        }
        await bot.sendMessage(chatId, '⏳ Fetching your results...');
        try {
            const result = await fetchResults(sessions[chatId].regNo, sessions[chatId].password);
            await bot.sendMessage(chatId, result, { parse_mode: 'Markdown' });
        } catch (err) {
            await bot.sendMessage(chatId, `❌ Failed: ${err.message}`);
        }
        return;
    }

    // FEES command
    if (text.toUpperCase() === 'FEES') {
        if (!sessions[chatId]) {
            bot.sendMessage(chatId, '⚠️ Please login first using:\n`LOGIN regNumber password`', { parse_mode: 'Markdown' });
            return;
        }
        await bot.sendMessage(chatId, '⏳ Fetching your fee balance...');
        try {
            const result = await fetchFees(sessions[chatId].regNo, sessions[chatId].password);
            await bot.sendMessage(chatId, result, { parse_mode: 'Markdown' });
        } catch (err) {
            await bot.sendMessage(chatId, `❌ Failed: ${err.message}`);
        }
        return;
    }

    // TIMETABLE command
    if (text.toUpperCase() === 'TIMETABLE') {
        if (!sessions[chatId]) {
            bot.sendMessage(chatId, '⚠️ Please login first using:\n`LOGIN regNumber password`', { parse_mode: 'Markdown' });
            return;
        }
        await bot.sendMessage(chatId, '⏳ Fetching your timetable...');
        try {
            const result = await fetchTimetable(sessions[chatId].regNo, sessions[chatId].password);
            await bot.sendMessage(chatId, result, { parse_mode: 'Markdown' });
        } catch (err) {
            await bot.sendMessage(chatId, `❌ Failed: ${err.message}`);
        }
        return;
    }

    bot.sendMessage(chatId, 'Send /start for instructions.');
});

async function loginOSIM(regNo, password) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    try {
        await page.goto('https://osim.bugando.ac.tz/', { waitUntil: 'networkidle2', timeout: 30000 });
        await page.type('input[type="text"]', regNo);
        await page.type('input[type="password"]', password);
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });

        const url = page.url();
        if (url.includes('login')) throw new Error('Invalid credentials');

        const name = await page.evaluate(() => {
            const el = document.querySelector('.navbar-text, .student-name, .user-name, h4, h3');
            return el ? el.innerText.trim() : 'Student';
        }).catch(() => 'Student');

        await browser.close();

        return `✅ *Logged in successfully!*\n👤 *${name}*\n\nWhat would you like to check?\n• RESULTS\n• FEES\n• TIMETABLE`;

    } catch (err) {
        await browser.close();
        throw err;
    }
}

async function fetchResults(regNo, password) {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try {
        await page.goto('https://osim.bugando.ac.tz/', { waitUntil: 'networkidle2', timeout: 30000 });
        await page.type('input[type="text"]', regNo);
        await page.type('input[type="password"]', password);
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });

        // Navigate to results page
        await page.goto('https://osim.bugando.ac.tz/students/results', { waitUntil: 'networkidle2', timeout: 20000 });

        const results = await page.evaluate(() => {
            const rows = document.querySelectorAll('table tr');
            if (!rows.length) return 'No results found.';
            let text = '';
            rows.forEach(row => {
                const cells = row.querySelectorAll('td, th');
                const line = Array.from(cells).map(c => c.innerText.trim()).join(' | ');
                if (line.trim()) text += line + '\n';
            });
            return text || 'No results data found.';
        });

        await browser.close();
        return `📊 *Your Results:*\n\n\`\`\`\n${results}\`\`\``;
    } catch (err) {
        await browser.close();
        throw err;
    }
}

async function fetchFees(regNo, password) {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try {
        await page.goto('https://osim.bugando.ac.tz/', { waitUntil: 'networkidle2', timeout: 30000 });
        await page.type('input[type="text"]', regNo);
        await page.type('input[type="password"]', password);
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });

        await page.goto('https://osim.bugando.ac.tz/students/fees', { waitUntil: 'networkidle2', timeout: 20000 });

        const fees = await page.evaluate(() => {
            const rows = document.querySelectorAll('table tr');
            if (!rows.length) return 'No fee information found.';
            let text = '';
            rows.forEach(row => {
                const cells = row.querySelectorAll('td, th');
                const line = Array.from(cells).map(c => c.innerText.trim()).join(' | ');
                if (line.trim()) text += line + '\n';
            });
            return text || 'No fee data found.';
        });

        await browser.close();
        return `💰 *Your Fee Balance:*\n\n\`\`\`\n${fees}\`\`\``;
    } catch (err) {
        await browser.close();
        throw err;
    }
}

async function fetchTimetable(regNo, password) {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try {
        await page.goto('https://osim.bugando.ac.tz/', { waitUntil: 'networkidle2', timeout: 30000 });
        await page.type('input[type="text"]', regNo);
        await page.type('input[type="password"]', password);
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });

        await page.goto('https://osim.bugando.ac.tz/students/timetable', { waitUntil: 'networkidle2', timeout: 20000 });

        const timetable = await page.evaluate(() => {
            const rows = document.querySelectorAll('table tr');
            if (!rows.length) return 'No timetable found.';
            let text = '';
            rows.forEach(row => {
                const cells = row.querySelectorAll('td, th');
                const line = Array.from(cells).map(c => c.innerText.trim()).join(' | ');
                if (line.trim()) text += line + '\n';
            });
            return text || 'No timetable data found.';
        });

        await browser.close();
        return `📅 *Your Timetable:*\n\n\`\`\`\n${timetable}\`\`\``;
    } catch (err) {
        await browser.close();
        throw err;
    }
}
