(() => {
    'use strict';

    // ============ 3rd-party libs for nicer console output ============
    let pc, logUpdate, Table;

    // Try to load dependencies, with fallbacks
    try {
        pc = require('picocolors');
    } catch (e) {
        // Fallback colors implementation
        pc = {
            bold: (s) => `\x1b[1m${s}\x1b[0m`,
            dim: (s) => `\x1b[2m${s}\x1b[0m`,
            red: (s) => `\x1b[31m${s}\x1b[0m`,
            green: (s) => `\x1b[32m${s}\x1b[0m`,
            yellow: (s) => `\x1b[33m${s}\x1b[0m`,
            blue: (s) => `\x1b[34m${s}\x1b[0m`,
            magenta: (s) => `\x1b[35m${s}\x1b[0m`,
            cyan: (s) => `\x1b[36m${s}\x1b[0m`,
            gray: (s) => `\x1b[90m${s}\x1b[0m`,
        };
    }

    try {
        logUpdate = require('log-update');
    } catch (e) {
        // Fallback logUpdate implementation
        logUpdate = (text) => {
            process.stdout.write('\x1b[2J\x1b[0f' + text);
        };
        logUpdate.clear = () => {
            process.stdout.write('\x1b[2J\x1b[0f');
        };
    }

    try {
        Table = require('cli-table3');
    } catch (e) {
        // Simple fallback table implementation
        Table = class {
            constructor(options) {
                this.options = options || {};
                this.rows = [];
            }
            push(row) {
                this.rows.push(row);
            }
            toString() {
                return this.rows.map(row => row.join(' | ')).join('\n');
            }
        };
    }

    // =========================
    // AppleVille Bot — Fixed Input Version
    // =========================

    // ====== CONFIG ======
    const DEFAULT_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const DEFAULT_SEED = 'royal-apple';
    const DEFAULT_BUY_QTY = 12;
    const DEFAULT_BOOSTER = 'quantum-fertilizer';
    const DEFAULT_BOOSTER_QTY = 12;
    const AUTO_REFRESH_BOOSTER = true;
    const BASE = 'https://app.appleville.xyz/api/trpc';
    const ITEM_TYPE = 'SEED';
    const MODIFIER_TYPE = 'MODIFIER';
    const PAUSE_MS = 150;

    // ====== IMPROVED COOKIE HANDLER ======
    const fs = require('fs');
    const path = require('path');
    const readline = require('node:readline');

    const COOKIE_FILE = path.join(__dirname, 'akun.txt');
    let COOKIE = '';

    // Clean readline interface
    function createCleanReadline() {
        // Clear any existing input
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
        }

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
            historySize: 0 // Disable history
        });

        return rl;
    }

    // Improved cookie input with better paste handling
    async function ensureCookieInteractive() {
        // Try to read existing cookie
        try {
            COOKIE = fs.readFileSync(COOKIE_FILE, 'utf8').trim();
            if (COOKIE && !COOKIE.includes('PASTE') && COOKIE.length > 20) {
                console.log('✅ Cookie ditemukan di akun.txt');
                return COOKIE;
            }
        } catch { }

        console.clear();
        console.log('🍎 === AppleVille Bot Cookie Setup ===\n');

        const rl = createCleanReadline();

        try {
            console.log('Cara mendapatkan cookie:');
            console.log('1. Buka browser → https://app.appleville.xyz');
            console.log('2. Login ke akun Anda');
            console.log('3. Tekan F12 → Tab Application → Cookies');
            console.log('4. Copy semua cookies\n');

            // Simple prompt with better handling
            const cookieInput = await new Promise((resolve, reject) => {
                console.log('📋 Paste cookie di bawah ini lalu tekan ENTER:');
                console.log('─'.repeat(50));

                let inputReceived = false;
                const timeout = setTimeout(() => {
                    if (!inputReceived) {
                        reject(new Error('Timeout - tidak ada input dalam 2 menit'));
                    }
                }, 120000); // 2 minutes timeout

                rl.once('line', (input) => {
                    inputReceived = true;
                    clearTimeout(timeout);

                    // Clean the input
                    const cleaned = input
                        .replace(/\r?\n/g, '') // Remove newlines
                        .replace(/\s+/g, ' ')   // Normalize spaces
                        .trim();

                    resolve(cleaned);
                });
            });

            rl.close();

            // Validate cookie
            if (!cookieInput || cookieInput.length < 20) {
                throw new Error('Cookie terlalu pendek atau kosong');
            }

            if (!cookieInput.includes('=')) {
                throw new Error('Format cookie tidak valid - harus mengandung "="');
            }

            // Save cookie
            try {
                fs.writeFileSync(COOKIE_FILE, cookieInput + '\n', 'utf8');
                console.log('✅ Cookie berhasil disimpan ke akun.txt\n');
            } catch (error) {
                console.warn(`⚠️  Gagal menyimpan ke file: ${error.message}`);
            }

            COOKIE = cookieInput;
            return COOKIE;

        } catch (error) {
            rl.close();
            console.error(`❌ Error: ${error.message}\n`);

            // Offer alternative method
            console.log('🔄 Metode alternatif:');
            console.log('1. Buat file "akun.txt" di folder yang sama dengan script ini');
            console.log('2. Copy-paste cookie ke dalam file tersebut');
            console.log('3. Save file dan jalankan ulang script\n');

            process.exit(1);
        }
    }

    // Simple input function with timeout
    async function askQuestion(question, defaultValue = '') {
        const rl = createCleanReadline();

        try {
            const answer = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Input timeout'));
                }, 30000); // 30 seconds

                rl.question(question, (input) => {
                    clearTimeout(timeout);
                    resolve(input.trim());
                });
            });

            rl.close();
            return answer || defaultValue;
        } catch (error) {
            rl.close();
            return defaultValue;
        }
    }

    // ====== REST OF THE ORIGINAL CODE (unchanged) ======

    // DATA
    const SEEDS = {
        'wheat': { name: 'Wheat', price: 2, priceCurrency: 'coins', growSeconds: 5 },
        'lettuce': { name: 'Lettuce', price: 8, priceCurrency: 'coins', growSeconds: 30 },
        'golden-apple': { name: 'Golden Apple', price: 10, priceCurrency: 'apples', growSeconds: 120 },
        'carrot': { name: 'Carrot', price: 25, priceCurrency: 'coins', growSeconds: 180 },
        'crystal-apple': { name: 'Crystal Apple', price: 40, priceCurrency: 'apples', growSeconds: 600 },
        'tomato': { name: 'Tomato', price: 80, priceCurrency: 'coins', growSeconds: 900 },
        'onion': { name: 'Onion', price: 200, priceCurrency: 'coins', growSeconds: 3600 },
        'diamond-apple': { name: 'Diamond Apple', price: 150, priceCurrency: 'apples', growSeconds: 3600 },
        'royal-apple': { name: 'Royal Apple', price: 500, priceCurrency: 'apples', growSeconds: 18000 },
        'strawberry': { name: 'Strawberry', price: 600, priceCurrency: 'coins', growSeconds: 14400 },
        'pumpkin': { name: 'Pumpkin', price: 1500, priceCurrency: 'coins', growSeconds: 43200 },
    };

    const BOOSTERS = {
        'fertiliser': { name: 'Fertiliser', price: 18, priceCurrency: 'coins', effect: '+43% growth, 12h' },
        'silver-tonic': { name: 'Silver Tonic', price: 15, priceCurrency: 'coins', effect: '+25% yield, 12h' },
        'super-fertiliser': { name: 'Super Fertiliser', price: 25, priceCurrency: 'apples', effect: '+100% growth, 12h' },
        'golden-tonic': { name: 'Golden Tonic', price: 50, priceCurrency: 'apples', effect: '+100% yield, 12h' },
        'deadly-mix': { name: 'Deadly Mix', price: 150, priceCurrency: 'apples', effect: '-40% yield, +700% growth, 12h' },
        'quantum-fertilizer': { name: 'Quantum Fertilizer', price: 175, priceCurrency: 'apples', effect: '+50% yield, +150% growth, 12h' },
    };

    // ENV CHECK
    if (!globalThis.fetch) {
        console.error('Node 18+ diperlukan (fetch builtin).');
        process.exit(1);
    }

    // NICE LOGS
    const isWin = process.platform === 'win32';
    const supportsVT = !!process.env.WT_SESSION || !!process.env.ConEmuANSI || !!process.env.ANSICON || process.env.TERM_PROGRAM === 'vscode' || (process.env.TERM && /xterm|vt100|ansi|cygwin|linux/i.test(process.env.TERM));
    const FLAG_PLAIN = process.argv.includes('--plain') || process.argv.includes('--no-color') || !!process.env.NO_COLOR;
    const FLAG_ASCII = process.argv.includes('--ascii');
    const COLOR_ENABLED = !FLAG_PLAIN && process.stdout.isTTY && supportsVT;
    const UNICODE_ENABLED = !FLAG_ASCII && (!isWin || !!process.env.WT_SESSION || process.env.TERM_PROGRAM === 'vscode');
    const useLogUpdate = process.stdout.isTTY && supportsVT && !FLAG_PLAIN && typeof logUpdate === 'function';
    const nowStr = () => new Date().toLocaleTimeString('sv-SE', { hour12: false });
    const nowMs = () => Date.now();
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const C = {
        bold: (s) => COLOR_ENABLED ? pc.bold(s) : s,
        dim: (s) => COLOR_ENABLED ? pc.dim(s) : s,
        red: (s) => COLOR_ENABLED ? pc.red(s) : s,
        green: (s) => COLOR_ENABLED ? pc.green(s) : s,
        yellow: (s) => COLOR_ENABLED ? pc.yellow(s) : s,
        blue: (s) => COLOR_ENABLED ? pc.blue(s) : s,
        magenta: (s) => COLOR_ENABLED ? pc.magenta(s) : s,
        cyan: (s) => COLOR_ENABLED ? pc.cyan(s) : s,
        gray: (s) => COLOR_ENABLED ? pc.gray(s) : s,
    };

    const icons = UNICODE_ENABLED ?
        { ok: '✅', warn: '⚠️', err: '❌', plant: '🌱', boost: '⚡', harvest: '🔪', buy: '🛒', info: 'ℹ️', clock: '⏳' } :
        { ok: 'OK', warn: '!!', err: 'XX', plant: 'PLT', boost: 'BST', harvest: 'HV', buy: 'BUY', info: 'i', clock: '[]' };

    const ts = () => C.cyan(`[${nowStr()}]`);
    const log = {
        info: (m) => console.log(`${ts()} ${m}`),
        ok: (m) => console.log(`${ts()} ${C.green(icons.ok + ' ' + m)}`),
        warn: (m) => console.log(`${ts()} ${C.yellow(icons.warn + ' ' + m)}`),
        err: (m) => console.log(`${ts()} ${C.red(icons.err + ' ' + m)}`),
        step: (m) => console.log(`${ts()} ${C.magenta(m)}`),
        section(title) {
            const cols = process.stdout.columns || 80;
            const line = '─'.repeat(Math.max(10, Math.min(60, cols - 10)));
            console.log(`${ts()} ${C.bold(C.blue('┏ ' + title + ' '))}${C.blue(line)}`);
        },
        sectionEnd() { console.log(`${ts()} ${C.blue('┗')}`); }
    };

    const fmtSec = (s) => {
        s = Math.max(0, Math.floor(s));
        const h = Math.floor(s / 3600); s %= 3600;
        const m = Math.floor(s / 60); const ss = s % 60;
        if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`;
        if (m > 0) return `${m}m${String(ss).padStart(2, '0')}s`;
        return `${ss}s`;
    };

    // SIGNATURE (mutations)
    const crypto = require('crypto');
    async function generateSignature(inputPayload) {
        const SECRET_KEY = "aspih0f7303f0248gh204429g24d9jah9dsg97h9!eda";
        const timestamp = Date.now();
        const nonce = crypto.randomBytes(16).toString('hex');
        const payloadString = JSON.stringify(inputPayload ?? {});
        const message = `${timestamp}.${nonce}.${payloadString}`;
        const signature = crypto.createHmac('sha256', SECRET_KEY).update(message, 'utf8').digest('hex');
        return { signature, timestamp, nonce };
    }

    async function mutationHeaders(payload) {
        try {
            const { signature, timestamp, nonce } = await generateSignature(payload);
            return { 'x-meta-hash': signature, 'x-client-time': String(timestamp), 'x-trace-id': nonce };
        } catch { return {}; }
    }

    // TRPC HTTP (unchanged from original)
    function parseTrpcResponseText(text) {
        try { return JSON.parse(text); } catch { }
        const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        if (!lines.length) throw new Error('Empty tRPC response');
        try { return JSON.parse(lines[lines.length - 1]); } catch {
            throw new Error(`Invalid JSON/JSONL response: ${text.slice(0, 300)}`);
        }
    }

    function normalizeTrpc(json) {
        if (Array.isArray(json)) return json[0];
        if (json && Array.isArray(json.json)) return json.json[0];
        return json;
    }

    async function trpcPost(path, payload) {
        const url = `${BASE}/${path}?batch=1`;
        let sigPayload = null;
        if (payload && payload[0] && payload[0].json) sigPayload = payload[0].json;

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'content-type': 'application/json',
                'cookie': COOKIE,
                'origin': 'https://app.appleville.xyz',
                'referer': 'https://app.appleville.xyz/',
                'user-agent': 'Mozilla/5.0',
                'trpc-accept': 'application/json',
                'x-trpc-source': 'nextjs-react',
                ...(await mutationHeaders(sigPayload)),
            },
            body: JSON.stringify(payload),
        });
        const text = await res.text();
        const parsed = parseTrpcResponseText(text);
        return normalizeTrpc(parsed);
    }

    async function trpcGet(path) {
        const url = `${BASE}/${path}?batch=1`;
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': 'application/json',
                'cookie': COOKIE,
                'origin': 'https://app.appleville.xyz',
                'referer': 'https://app.appleville.xyz/',
                'user-agent': 'Mozilla/5.0',
                'trpc-accept': 'application/json',
                'x-trpc-source': 'nextjs-react',
            },
        });
        const text = await res.text();
        const parsed = parseTrpcResponseText(text);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.json)) return parsed.json;
        return parsed;
    }

    const isErrorItem = (item) => !!(item?.error || item?.error?.json);
    const getError = (item) => {
        const ej = item?.error?.json || item?.error || item;
        return { message: ej?.message || 'Unknown error', code: ej?.data?.code || ej?.code, path: ej?.data?.path || 'unknown', httpStatus: ej?.data?.httpStatus };
    };

    // STATE & ACTIONS (unchanged)
    async function getState() {
        const data = await trpcGet('auth.me,core.getState');
        if (Array.isArray(data) && data.length >= 2) {
            return { ok: true, user: data[0]?.result?.data?.json, state: data[1]?.result?.data?.json };
        }
        return { ok: false, err: { message: 'Failed to parse state' } };
    }

    async function plantMultiple(plantings) {
        if (!plantings.length) return { ok: true, data: { plantedSeeds: 0 } };
        const item = await trpcPost('core.plantSeed', { 0: { json: { plantings } } });
        if (isErrorItem(item)) return { ok: false, err: getError(item) };
        return { ok: true, data: item?.result?.data?.json };
    }

    async function applyModifierMultiple(applications) {
        if (!applications.length) return { ok: true, data: { appliedModifiers: 0 } };
        const item = await trpcPost('core.applyModifier', { 0: { json: { applications } } });
        if (isErrorItem(item)) return { ok: false, err: getError(item) };
        return { ok: true, data: item?.result?.data?.json };
    }

    async function harvestMultiple(slotIndexes) {
        if (!slotIndexes.length) return { ok: true, data: { plotResults: [] } };
        const item = await trpcPost('core.harvest', { 0: { json: { slotIndexes } } });
        if (isErrorItem(item)) return { ok: false, err: getError(item) };
        return { ok: true, data: item?.result?.data?.json };
    }

    async function buy(key, quantity, type) {
        if (quantity <= 0) return { ok: true, data: { purchasedItems: 0 } };
        const item = await trpcPost('core.buyItem', { 0: { json: { purchases: [{ key, quantity, type }] } } });
        if (isErrorItem(item)) return { ok: false, err: getError(item) };
        return { ok: true, data: item?.result?.data?.json };
    }

    // HELPERS (unchanged from original - too long to include here)
    function slotMapFromState(state) {
        const plots = state?.plots || [];
        const map = new Map();
        for (const p of plots) {
            const slot = p.slotIndex;
            map.set(slot, {
                slot,
                seedKey: p.seed?.key || null,
                seedEndsAt: p.seed?.endsAt ? new Date(p.seed.endsAt).getTime() : null,
                modifierKey: p.modifier?.key || null,
                boosterEndsAt: p.modifier?.endsAt ? new Date(p.modifier.endsAt).getTime() : null,
            });
        }
        return map;
    }

    function inventoryCount(state, key, type) {
        const hit = (state?.items || []).find(x => x.key === key && x.type === type);
        return hit?.quantity || 0;
    }

    // MAIN FUNCTION
    let isRunning = true;
    process.on('SIGINT', () => {
        isRunning = false;
        console.log('');
        log.warn('Dihentikan oleh user (Ctrl + C).');
    });

    (async function main() {
        try {
            // Setup cookie with improved input handling
            await ensureCookieInteractive();

            const seedList = Object.keys(SEEDS).join(', ');
            const boosterList = 'none, ' + Object.keys(BOOSTERS).join(', ');

            // Get user preferences with better input handling
            console.log('🍎 === Setup Bot Configuration ===\n');

            const slotsAns = await askQuestion(`Masukkan slot (mis: 1,2,3) [default ${DEFAULT_SLOTS.join(',')}]: `);
            let slots = DEFAULT_SLOTS;
            if (slotsAns && slotsAns.trim()) {
                slots = Array.from(new Set(slotsAns.split(',').map(x => parseInt(x.trim(), 10)).filter(n => Number.isInteger(n) && n > 0))).sort((a, b) => a - b);
                if (!slots.length) {
                    console.error('❌ Slot tidak valid.');
                    process.exit(1);
                }
            }

            const seedAns = await askQuestion(`Pilih seed (${seedList}) [default ${DEFAULT_SEED}]: `);
            const seedKey = (seedAns && seedAns.trim()) ? seedAns.trim().toLowerCase() : DEFAULT_SEED;
            if (!SEEDS[seedKey]) {
                console.error(`❌ Seed '${seedKey}' tidak dikenal.`);
                process.exit(1);
            }

            const buyAns = await askQuestion(`Buy quantity seeds saat habis [default ${DEFAULT_BUY_QTY}]: `);
            const seedBuyQty = buyAns && buyAns.trim() ? Math.max(1, parseInt(buyAns.trim(), 10)) : DEFAULT_BUY_QTY;

            console.log(`\n${C.bold('🧪 Available Boosters:')}`);
            Object.entries(BOOSTERS).forEach(([k, m]) => {
                console.log(`  ${C.yellow(k)}: ${m.name} - ${m.effect} (${m.price} ${m.priceCurrency})`);
            });

            const boosterAns = await askQuestion(`\nPilih booster (${boosterList}) [default ${DEFAULT_BOOSTER}]: `);
            const boosterKey = (boosterAns && boosterAns.trim()) ? boosterAns.trim().toLowerCase() : DEFAULT_BOOSTER;
            if (boosterKey !== 'none' && !BOOSTERS[boosterKey]) {
                console.error(`❌ Booster '${boosterKey}' tidak dikenal.`);
                process.exit(1);
            }

            let boosterBuyQty = DEFAULT_BOOSTER_QTY;
            if (boosterKey !== 'none') {
                const boosterBuyAns = await askQuestion(`Buy quantity booster saat habis [default ${DEFAULT_BOOSTER_QTY}]: `);
                boosterBuyQty = boosterBuyAns && boosterBuyAns.trim() ? Math.max(1, parseInt(boosterBuyAns.trim(), 10)) : DEFAULT_BOOSTER_QTY;
            }

            const meta = SEEDS[seedKey];
            console.log('\n' + '═'.repeat(60));
            log.section('START FARMING');
            log.info(`${C.bold('Seed')}=${seedKey} (base=${meta.growSeconds}s)`);
            log.info(`${C.bold('Slots')}=${slots.join(', ')}`);
            log.info(`${C.bold('Buy Quantity')}=Seeds:${seedBuyQty}, Booster:${boosterBuyQty}`);
            log.info(`${C.bold('Booster')}=${boosterKey}${boosterKey !== 'none' ? ` (${BOOSTERS[boosterKey].effect})` : ''}`);
            log.sectionEnd();

            // INIT STATE - Test cookie first
            console.log('\n🔄 Testing connection...');
            let st = await getState();
            if (!st.ok) {
                log.err(`❌ getState gagal: ${st.err?.message || 'unknown'}`);
                console.log('\n💡 Kemungkinan masalah:');
                console.log('   - Cookie sudah expired');
                console.log('   - Format cookie salah');
                console.log('   - Koneksi internet bermasalah');
                console.log('\n🔧 Solusi:');
                console.log('   - Hapus file akun.txt dan jalankan ulang script');
                console.log('   - Pastikan login di browser masih aktif');
                process.exit(1);
            }

            console.log(`✅ Connected! User: ${st.user?.name || 'Unknown'}`);
            console.log(`💰 Balance: ${st.state?.coins || 0} coins, ${st.state?.apples || 0} apples`);

            // Apply booster to already planted slots
            const mapInit = slotMapFromState(st.state);
            const plantedInit = slots.filter(s => !!mapInit.get(s)?.seedKey);
            if (plantedInit.length && boosterKey !== 'none') {
                log.step(`${icons.boost} Checking/applying booster for planted slots: ${plantedInit.join(', ')}`);
                const { refreshed } = await ensureBoosterForSlots(st, plantedInit, boosterKey, boosterBuyQty);
                if (refreshed) st = await getState();
            }

            // Plant empty slots
            const plantRes = await ensurePlantForEmpty(st, slots, seedKey, seedBuyQty, boosterKey, boosterBuyQty);
            if (plantRes.refreshedAfterBooster) st = await getState();

            // Build pending times
            const latest = slotMapFromState(st.state);
            const pendingSeed = new Map();
            const pendingBoost = new Map();
            for (const s of slots) {
                const r = latest.get(s);
                if (r?.seedKey && r?.seedEndsAt) {
                    pendingSeed.set(s, r.seedEndsAt);
                    pendingBoost.set(s, r.boosterEndsAt || null);
                }
            }

            if (!pendingSeed.size) {
                log.warn('❌ Tidak ada slot tertanam setelah init. Keluar.');
                return;
            }

            console.log('\n🎯 Bot started! Press Ctrl+C to stop\n');

            // MAIN FARMING LOOP
            while (isRunning) {
                // Display current status
                if (useLogUpdate) {
                    logUpdate(renderTicker(pendingSeed, pendingBoost));
                } else {
                    // Non-TTY fallback
                    if (!global.__lastFallback || Date.now() - global.__lastFallback > 60000) {
                        console.log(renderTicker(pendingSeed, pendingBoost));
                        global.__lastFallback = Date.now();
                    }
                }

                const tNow = nowMs();
                const ready = [];
                for (const [s, t] of pendingSeed.entries()) {
                    if (t <= tNow) ready.push(s);
                }

                // Harvest ready slots
                if (ready.length) {
                    if (useLogUpdate && logUpdate.clear) logUpdate.clear();

                    log.step(`${icons.harvest} Harvesting slots: ${ready.join(', ')}`);
                    const hv = await harvestMultiple(ready);

                    if (!hv.ok) {
                        log.err(`Harvest failed: ${hv.err?.message || 'unknown'}`);
                    } else {
                        const pr = hv.data?.plotResults || [];
                        const coins = pr.reduce((a, x) => a + (x.coinsEarned || 0), 0);
                        const apples = pr.reduce((a, x) => a + (x.apEarned || 0), 0);
                        const xp = pr.reduce((a, x) => a + (x.xpGained || 0), 0);
                        log.ok(`Earned: +${coins} coins${apples ? `, +${apples} apples` : ''}, +${xp} XP`);
                    }

                    await sleep(PAUSE_MS);

                    // Get fresh state and replant
                    let st2 = await getState();
                    if (!st2.ok) st2 = st;

                    await ensurePlantForEmpty(st2, ready, seedKey, seedBuyQty, boosterKey, boosterBuyQty);
                    await sleep(PAUSE_MS);

                    // Update pending times for replanted slots
                    const refreshed = await refreshEndsForSlots(ready);
                    for (const [s, obj] of refreshed.entries()) {
                        pendingSeed.set(s, obj.seedEndsAt);
                        pendingBoost.set(s, obj.boosterEndsAt || null);
                    }
                }

                // Auto-refresh expired boosters
                if (boosterKey !== 'none' && AUTO_REFRESH_BOOSTER) {
                    const needBooster = [];
                    for (const [s, tPlant] of pendingSeed.entries()) {
                        const bEnd = pendingBoost.get(s) || 0;
                        if (tPlant > tNow && (!bEnd || bEnd <= tNow)) {
                            needBooster.push(s);
                        }
                    }

                    if (needBooster.length) {
                        if (useLogUpdate && logUpdate.clear) logUpdate.clear();

                        log.step(`${icons.boost} Booster expired → re-applying: ${needBooster.join(', ')}`);
                        const st3 = await getState();
                        if (st3.ok) {
                            await ensureBoosterForSlots(st3, needBooster, boosterKey, boosterBuyQty);
                            await sleep(PAUSE_MS);

                            // Update booster end times
                            const ref2 = await refreshEndsForSlots(needBooster);
                            for (const [s, obj] of ref2.entries()) {
                                pendingSeed.set(s, obj.seedEndsAt);
                                pendingBoost.set(s, obj.boosterEndsAt || null);
                            }
                            log.ok(`Booster end times updated`);
                        }
                    }
                }

                await sleep(1000);
            }

            if (useLogUpdate && logUpdate.clear) logUpdate.clear();
            log.info('✅ Bot stopped gracefully.');

        } catch (error) {
            console.error(`\n❌ Fatal error: ${error.message}`);
            console.error('Stack:', error.stack);
            process.exit(1);
        }
    })();

    // ====== HELPER FUNCTIONS (continued from main code) ======

    async function ensureBoosterForSlots(st, slots, boosterKey, boosterBuyQty) {
        if (!boosterKey || boosterKey === 'none' || !slots.length) return { applied: 0 };

        const map = slotMapFromState(st.state);
        const toApply = [];

        for (const s of slots) {
            const info = map.get(s);
            if (!info?.seedKey) continue;

            const active = info.modifierKey === boosterKey &&
                info.boosterEndsAt &&
                info.boosterEndsAt > nowMs();

            if (!active) {
                toApply.push({ slotIndex: s, modifierKey: boosterKey });
            }
        }

        if (!toApply.length) return { applied: 0 };

        // Check inventory and buy if needed
        const have = inventoryCount(st.state, boosterKey, MODIFIER_TYPE);
        const missing = Math.max(0, toApply.length - have);

        if (missing > 0) {
            const buyQty = Math.max(boosterBuyQty, missing);
            log.warn(`${icons.buy} Need more boosters: have=${have}, need=${toApply.length} → buying ${buyQty} ${boosterKey}`);

            const b = await buy(boosterKey, buyQty, MODIFIER_TYPE);
            if (!b.ok) {
                log.err(`Buy booster failed: ${b.err?.message || 'unknown'}`);
            } else {
                log.ok(`${icons.buy} Booster purchased successfully`);
            }
            await sleep(PAUSE_MS);
        }

        // Apply boosters
        const r = await applyModifierMultiple(toApply);
        if (!r.ok) {
            log.err(`${icons.boost} Apply booster failed: ${r.err?.message || 'unknown'}`);
        } else {
            log.ok(`${icons.boost} Booster applied to ${r.data?.appliedModifiers ?? toApply.length} slots`);
        }

        await sleep(PAUSE_MS);
        const refreshed = await refreshSlots(slots);
        return { applied: r.ok ? (r.data?.appliedModifiers ?? toApply.length) : 0, refreshed };
    }

    async function ensurePlantForEmpty(st, slots, seedKey, seedBuyQty, boosterKey, boosterBuyQty) {
        const map = slotMapFromState(st.state);
        const empty = slots.filter(s => !map.get(s)?.seedKey);

        if (!empty.length) return { planted: 0 };

        // Check seed inventory and buy if needed
        const haveSeeds = inventoryCount(st.state, seedKey, ITEM_TYPE);
        const missing = Math.max(0, empty.length - haveSeeds);

        if (missing > 0) {
            const buyQty = Math.max(seedBuyQty, missing);
            log.warn(`${icons.buy} Need more seeds: have=${haveSeeds}, need=${empty.length} → buying ${buyQty} ${seedKey}`);

            const b = await buy(seedKey, buyQty, ITEM_TYPE);
            if (!b.ok) {
                log.err(`Buy seeds failed: ${b.err?.message || 'unknown'}`);
            } else {
                log.ok(`${icons.buy} Seeds purchased successfully`);
            }
            await sleep(PAUSE_MS);
        }

        // Plant seeds
        const p = await plantMultiple(empty.map(slotIndex => ({ slotIndex, seedKey })));
        if (!p.ok) {
            log.err(`${icons.plant} Planting failed: ${p.err?.message || 'unknown'}`);
        } else {
            log.ok(`${icons.plant} Planted ${p.data?.plantedSeeds ?? empty.length} slot(s)`);
        }
        await sleep(PAUSE_MS);

        // Apply booster to new plants
        let refreshedAfterBooster = null;
        if (boosterKey && boosterKey !== 'none') {
            const haveB = inventoryCount(st.state, boosterKey, MODIFIER_TYPE);
            const missB = Math.max(0, empty.length - haveB);

            if (missB > 0) {
                const buyQty = Math.max(boosterBuyQty, missB);
                log.warn(`${icons.buy} Need boosters for new plants: have=${haveB}, need=${empty.length} → buying ${buyQty} ${boosterKey}`);

                const bb = await buy(boosterKey, buyQty, MODIFIER_TYPE);
                if (!bb.ok) {
                    log.err(`Buy booster failed: ${bb.err?.message || 'unknown'}`);
                } else {
                    log.ok(`${icons.buy} Booster purchased for new plants`);
                }
                await sleep(PAUSE_MS);
            }

            const a = await applyModifierMultiple(empty.map(slotIndex => ({ slotIndex, modifierKey: boosterKey })));
            if (!a.ok) {
                log.err(`${icons.boost} Apply booster (new plants) failed: ${a.err?.message || 'unknown'}`);
            } else {
                log.ok(`${icons.boost} Booster applied to ${a.data?.appliedModifiers ?? empty.length} new plants`);
            }
            await sleep(PAUSE_MS);
            refreshedAfterBooster = await refreshSlots(empty);
        }

        return { planted: p.ok ? (p.data?.plantedSeeds ?? empty.length) : 0, refreshedAfterBooster };
    }

    function calculateEstimatedEnd(seedKey, boosterKey) {
        const meta = SEEDS[seedKey];
        if (!meta) return null;

        let base = meta.growSeconds;
        if (boosterKey && boosterKey !== 'none') {
            switch (boosterKey) {
                case 'fertiliser': base = Math.round(base / 1.43); break;
                case 'super-fertiliser': base = Math.round(base / 2); break;
                case 'deadly-mix': base = Math.round(base / 8); break;
                case 'quantum-fertilizer': base = Math.round(base / 2.5); break;
            }
        }
        return nowMs() + base * 1000;
    }

    async function refreshSlots(slots) {
        const st = await getState();
        if (!st.ok) return null;

        const map = slotMapFromState(st.state);
        const out = new Map();

        for (const s of slots) {
            const row = map.get(s);
            if (row?.seedKey && row?.seedEndsAt) {
                out.set(s, {
                    seedEndsAt: row.seedEndsAt,
                    boosterEndsAt: row.boosterEndsAt || null,
                    modifierKey: row.modifierKey || null
                });
            }
        }
        return out;
    }

    async function refreshEndsForSlots(slots) {
        const refreshed = await refreshSlots(slots);
        if (refreshed) return refreshed;

        // Fallback estimation
        const out = new Map();
        for (const s of slots) {
            out.set(s, {
                seedEndsAt: calculateEstimatedEnd(DEFAULT_SEED, DEFAULT_BOOSTER),
                boosterEndsAt: null
            });
        }
        return out;
    }

    // TABLE TICKER DISPLAY
    function renderTicker(pendingSeed, pendingBoost) {
        // Sort by plant end time ascending
        const arr = [...pendingSeed.entries()].map(([s, t]) => {
            const p = Math.ceil((t - nowMs()) / 1000);
            const bEnd = pendingBoost.get(s) || null;
            const b = bEnd ? Math.ceil((bEnd - nowMs()) / 1000) : null;
            return { s, p, b };
        }).sort((a, b) => a.p - b.p);

        const term = process.stdout.columns || 100;
        const cols = Math.max(2, Math.min(6, Math.floor(term / 18))); // 2-6 columns
        const rows = 2;
        const capacity = cols * rows;

        const shown = arr.slice(0, capacity);
        const hiddenCount = Math.max(0, arr.length - shown.length);

        const headerLeft = `${icons.clock} ${C.bold(String(arr.length))} slots farming`;
        const next = arr[0] ? `${C.green(fmtSec(arr[0].p))} ${C.gray(`(slot${String(arr[0].s).padStart(2, '0')})`)}` : 'none';
        const headerRight = `next harvest: ${next}`;

        // Build table cells
        const row1 = [], row2 = [];
        const makeCell = (x) => {
            const slot = `slot${String(x.s).padStart(2, '0')}`;
            const p = C.green(`🌱${fmtSec(x.p)}`);
            const b = x.b !== null ? `\n${C.yellow(`⚡${fmtSec(x.b)}`)}` : '';
            return `${slot}\n${p}${b}`;
        };

        for (let i = 0; i < shown.length; i++) {
            const cell = makeCell(shown[i]);
            if (i < cols) row1.push(cell);
            else row2.push(cell);
        }

        while (row1.length < cols) row1.push('');
        while (row2.length < cols) row2.push('');

        const colWidths = new Array(cols).fill(Math.max(16, Math.floor((term - (cols + 1)) / cols)));
        const table = new Table({
            colWidths,
            wordWrap: false,
            style: { head: [], border: [], compact: true },
            chars: (!UNICODE_ENABLED ? {
                'top': '-', 'top-mid': '+', 'top-left': '+', 'top-right': '+',
                'bottom': '-', 'bottom-mid': '+', 'bottom-left': '+', 'bottom-right': '+',
                'left': '|', 'left-mid': '+', 'mid': '-', 'mid-mid': '+',
                'right': '|', 'right-mid': '+', 'middle': '|'
            } : undefined)
        });

        table.push(row1);
        table.push(row2);

        const header = `${ts()} ${headerLeft}  ${C.dim('|')}  ${headerRight}`;
        const footer = hiddenCount > 0 ? `\n  ${C.gray(`+${hiddenCount} more slots not shown`)}` : '';

        return `${header}\n${table.toString()}${footer}`;
    }

})();