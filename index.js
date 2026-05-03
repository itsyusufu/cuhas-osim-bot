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
        const rows = document.querySelectorAll('table tr');
        if (!rows.length) return null;
        let text = '';
        rows.forEach(row => {
            const cells = row.querySelectorAll('td, th');
            const line = Array.from(cells).map(c => c.innerText.trim()).filter(t => t).join(' | ');
            if (line) text += line + '\n';
        });
        return text || null;
    });
}

bot.onText(/\/start|\/help/, (msg) => {
    bot.sendMessage(msg.chat.id,
`Welcome to CUHAS OSIM Bot!

Send your credentials in this format:
LOGIN regNumber password

Example:
LOGIN CUHAS/BP/1234567/T/25 yourpassword

After login you can send:
- RESULTS
- FEES
- TIMETABLE
- COURSEWORK`
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
        await bot.sendMessage(chatId, 'Logging into OSIM...');
        try {
            const { browser, page } = await loginAndGo(regNo, password, null);
            const name = await page.evaluate(() => {
                const el = document.querySelector('.navbar-text, h4, h3, .student-name');
                return el ? el.innerText.trim() : 'Student';
            }).catch(() => 'Student');
            await browser.close();
            sessions[chatId] = { regNo, password };
            await bot.sendMessage(chatId, `Logged in successfully!\nWelcome ${name}\n\nYou can now send:\n- RESULTS\n- FEES\n- TIMETABLE\n- COURSEWORK`);
        } catch (err) {
            await bot.sendMessage(chatId, 'Login failed: ' + err.message);
        }
        return;
    }

    if (!sessions[chatId]) {
        bot.sendMessage(chatId, 'Please login first. Send /start for instructions.');
        return;
    }

    const { regNo, password } = sessions[chatId];

    if (text.toUpperCase() === 'RESULTS') {
        await bot.sendMessage(chatId, 'Fetching semester results...');
        try {
            const { browser, page } = await loginAndGo(regNo, password, 'https://osim.bugando.ac.tz/student/class/results');
            const data = await scrapeTable(page);
            await browser.close();
            await bot.sendMessage(chatId, data ? 'Semester Results:\n\n' + data : 'No results found.');
        } catch (err) {
            await bot.sendMessage(chatId, 'Error: ' + err.message);
        }
        return;
    }

    if (text.toUpperCase() === 'FEES') {
        await bot.sendMessage(chatId, 'Fetching fee balance...');
        try {
            const { browser, page } = await loginAndGo(regNo, password, 'https://osim.bugando.ac.tz/student/finance_info');
            const data = await scrapeTable(page);
            await browser.close();
            await bot.sendMessage(chatId, data ? 'Fee Information:\n\n' + data : 'No fee data found.');
        } catch (err) {
            await bot.sendMessage(chatId, 'Error: ' + err.message);
        }
        return;
    }

    if (text.toUpperCase() === 'TIMETABLE') {
        await bot.sendMessage(chatId, 'Fetching timetable...');
        try {
            const { browser, page } = await loginAndGo(regNo, password, 'https://osim.bugando.ac.tz/student/course_timetable');
            const data = await scrapeTable(page);
            await browser.close();
            await bot.sendMessage(chatId, data ? 'Academic Timetable:\n\n' + data : 'No timetable found.');
        } catch (err) {
            await bot.sendMessage(chatId, 'Error: ' + err.message);
        }
        return;
    }

    if (text.toUpperCase() === 'COURSEWORK') {
        await bot.sendMessage(chatId, 'Fetching coursework results...');
        try {
            const { browser, page } = await loginAndGo(regNo, password, 'https://osim.bugando.ac.tz/student/class/course_work');
            const data = await scrapeTable(page);
            await browser.close();
            await bot.sendMessage(chatId, data ? 'Coursework Results:\n\n' + data : 'No coursework data found.');
        } catch (err) {
            await bot.sendMessage(chatId, 'Error: ' + err.message);
        }
        return;
    }

    bot.sendMessage(chatId, 'Unknown command. Send /start for instructions.');
});
