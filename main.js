// =================================================================
// MAIN ENTRY POINT
// Titik awal untuk menjalankan bot.
// Mengelola setup, interaksi pengguna, dan inisialisasi bot.
// =================================================================

import readline from 'node:readline';
import fs from 'fs';
import path from 'path';
import { logger } from './utils/logger.js';
import { setCookie, api } from './services/api.js';
import { DEFAULT_SETTINGS, SEEDS, BOOSTERS } from './config.js';
import { Bot } from './core/bot.js';

// --- FUNGSI INTERAKSI PENGGUNA ---

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const askQuestion = (question) => {
    return new Promise((resolve) => {
        rl.question(question, (answer) => resolve(answer.trim()));
    });
};

async function ensureCookieInteractive() {
    const cookieFile = path.join(process.cwd(), 'akun.txt');
    try {
        const cookie = fs.readFileSync(cookieFile, 'utf8').trim();
        if (cookie) {
            logger.success('Cookie ditemukan di akun.txt');
            return cookie;
        }
    } catch { }

    logger.info('Cara mendapatkan cookie:');
    console.log('1. Buka browser → https://app.appleville.xyz');
    console.log('2. Login ke akun Anda');
    console.log('3. Tekan F12 → Tab Application → Cookies');
    console.log('4. Copy semua cookies dan paste di bawah ini.\n');

    const cookieInput = await askQuestion('📋 Paste cookie Anda di sini lalu tekan ENTER: ');

    if (!cookieInput || cookieInput.length < 20 || !cookieInput.includes('=')) {
        logger.error('Format cookie tidak valid. Coba lagi.');
        process.exit(1);
    }

    try {
        fs.writeFileSync(cookieFile, cookieInput, 'utf8');
        logger.success('Cookie berhasil disimpan ke akun.txt untuk penggunaan selanjutnya.');
    } catch (error) {
        logger.warn(`Gagal menyimpan cookie ke file: ${error.message}`);
    }
    return cookieInput;
}

// --- FUNGSI UTAMA ---

async function start() {
    try {
        const cookie = await ensureCookieInteractive();
        setCookie(cookie);

        // Verifikasi koneksi dan cookie
        logger.info('Memverifikasi koneksi dan cookie...');
        const initialState = await api.getState();
        if (!initialState.ok) {
            logger.error('Gagal terhubung. Periksa kembali cookie Anda atau koneksi internet.');
            process.exit(1);
        }

        // [DIUBAH] Menampilkan data yang lebih lengkap dan akurat
        const user = initialState.user;
        logger.success(`Terhubung sebagai: ${user?.rewardWalletAddress || 'Unknown'}`);
        logger.info(`💰 Saldo: ${user?.coins || 0} koin | ${user?.ap || 0} AP (apel)`);
        logger.info(`✨ XP: ${user?.xp || 0} | Level Prestige: ${user?.prestigeLevel || 0}`);


        // Kumpulkan konfigurasi dari pengguna
        const slotsAns = await askQuestion(`\nMasukkan slot (mis: 1,2,3) [default: semua]: `);
        let slots = slotsAns ? slotsAns.split(',').map(x => parseInt(x.trim(), 10)).filter(Boolean) : DEFAULT_SETTINGS.SLOTS;
        if (!slots.length) slots = DEFAULT_SETTINGS.SLOTS;

        const seedKey = (await askQuestion(`Pilih bibit [default: ${DEFAULT_SETTINGS.SEED}]: `) || DEFAULT_SETTINGS.SEED).toLowerCase();
        if (!SEEDS[seedKey]) {
            logger.error(`Bibit '${seedKey}' tidak dikenal.`);
            process.exit(1);
        }

        const boosterKey = (await askQuestion(`Pilih booster (ketik 'none' untuk tanpa booster) [default: ${DEFAULT_SETTINGS.BOOSTER}]: `) || DEFAULT_SETTINGS.BOOSTER).toLowerCase();
        if (boosterKey !== 'none' && !BOOSTERS[boosterKey]) {
            logger.error(`Booster '${boosterKey}' tidak dikenal.`);
            process.exit(1);
        }

        // Menambahkan kembali pertanyaan untuk jumlah pembelian
        const seedBuyQtyAns = await askQuestion(`Jumlah pembelian bibit saat habis [default: ${DEFAULT_SETTINGS.BUY_QTY_SEED}]: `);
        const seedBuyQty = parseInt(seedBuyQtyAns, 10) || DEFAULT_SETTINGS.BUY_QTY_SEED;

        let boosterBuyQty = DEFAULT_SETTINGS.BUY_QTY_BOOSTER;
        if (boosterKey !== 'none') {
            const boosterBuyQtyAns = await askQuestion(`Jumlah pembelian booster saat habis [default: ${DEFAULT_SETTINGS.BUY_QTY_BOOSTER}]: `);
            boosterBuyQty = parseInt(boosterBuyQtyAns, 10) || DEFAULT_SETTINGS.BUY_QTY_BOOSTER;
        }

        rl.close();

        const config = {
            slots,
            seedKey,
            boosterKey: boosterKey === 'none' ? null : boosterKey,
            seedBuyQty, // Menggunakan nilai dari input pengguna
            boosterBuyQty, // Menggunakan nilai dari input pengguna
        };

        logger.info('Konfigurasi bot selesai. Memulai...');

        // Membuat instance bot dan memulainya
        const bot = new Bot(config);
        await bot.start();

    } catch (error) {
        logger.error(`Terjadi kesalahan fatal: ${error.message}`);
        rl.close();
        process.exit(1);
    }
}

start();
