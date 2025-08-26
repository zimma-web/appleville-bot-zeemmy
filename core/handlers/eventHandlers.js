// =================================================================
// EVENT HANDLERS
// Berisi logika untuk menangani event khusus seperti CAPTCHA dan prestige.
// =================================================================

import { logger } from '../../utils/logger.js';
import { api, CaptchaError, SignatureError } from '../../services/api.js';
import { PRESTIGE_LEVELS } from '../../config.js';
import { sendTelegramMessage } from '../../utils/telegram.js';
import { updateSignature } from '../../utils/signature-updater.js';
import { loadSignatureConfig } from '../../utils/signature.js'; // Impor fungsi pemuat ulang

let TELEGRAM_SETTINGS = { ENABLED: false, CAPTCHA_RETRY_INTERVAL: 120000 };
try {
    const config = await import('../../telegram-config.js');
    TELEGRAM_SETTINGS = config.TELEGRAM_SETTINGS;
} catch (error) { }

export async function handleCaptchaRequired(bot) {
    if (bot.isPausedForCaptcha) return;
    bot.isPausedForCaptcha = true;
    bot.clearAllTimers();

    logger.error('CAPTCHA DIBUTUHKAN. Bot dijeda.');
    logger.info('Silakan selesaikan CAPTCHA di browser. Bot akan mencoba lagi secara otomatis.');

    const message = `🚨 *CAPTCHA Dibutuhkan!* 🚨\n\nAkun: \`${bot.userIdentifier}\`\n\nBot AppleVille dijeda. Mohon selesaikan CAPTCHA di browser.`;
    await sendTelegramMessage(message);

    bot.captchaCheckInterval = setInterval(
        () => checkForCaptchaResolution(bot),
        TELEGRAM_SETTINGS.CAPTCHA_RETRY_INTERVAL
    );
}

async function checkForCaptchaResolution(bot) {
    logger.info('Mencoba memeriksa status CAPTCHA...');
    try {
        const response = await api.getState();
        if (!response.ok) {
            logger.warn(`Pemeriksaan CAPTCHA gagal dengan pesan: ${response.error?.message}`);
            return;
        }

        logger.success('CAPTCHA sepertinya sudah diselesaikan!');

        const message = `✅ *CAPTCHA Selesai!* ✅\n\nAkun: \`${bot.userIdentifier}\`\n\nBot AppleVille akan melanjutkan operasi.`;
        await sendTelegramMessage(message);

        clearInterval(bot.captchaCheckInterval);
        bot.isPausedForCaptcha = false;
        await bot.initializeSlots(response.state);
    } catch (error) {
        if (error instanceof CaptchaError) {
            logger.warn('CAPTCHA masih aktif. Mencoba lagi nanti...');
        } else {
            logger.error(`Terjadi error saat memeriksa CAPTCHA: ${error.message}`);
        }
    }
}

export async function checkPrestigeUpgrade(bot) {
    if (!bot.isRunning || bot.isPausedForCaptcha || bot.isPausedForSignature) return;

    try {
        logger.debug('Memeriksa kemungkinan upgrade prestige...');
        const { user } = await api.getState();
        if (!user) return;

        const currentLevel = user.prestigeLevel || 0;
        const currentAP = user.ap || 0;
        const nextLevel = currentLevel + 1;

        if (PRESTIGE_LEVELS[nextLevel] && bot.notifiedPrestigeLevel < nextLevel) {
            const requiredAP = PRESTIGE_LEVELS[nextLevel].apRequired;

            if (currentAP >= requiredAP) {
                logger.success(`AP cukup untuk upgrade ke Prestige Level ${nextLevel}! Mengirim notifikasi...`);
                const message = `🎉 *Prestige Upgrade Siap!* 🎉\n\nAkun: \`${bot.userIdentifier}\`\n\nAP Anda sudah cukup untuk upgrade ke **Prestige Level ${nextLevel}**.\n\n*AP Saat Ini:* ${Math.floor(currentAP)}\n*Dibutuhkan:* ${requiredAP}`;
                await sendTelegramMessage(message);
                bot.notifiedPrestigeLevel = nextLevel;
            }
        }
    } catch (error) {
        if (error instanceof CaptchaError) return bot.handleCaptchaRequired();
        if (error instanceof SignatureError) return bot.handleSignatureError();
        logger.warn(`Gagal memeriksa upgrade prestige: ${error.message}`);
    }
}

export async function handleSignatureError(bot) {
    if (bot.isPausedForSignature) return;
    bot.isPausedForSignature = true;
    bot.clearAllTimers();

    logger.error('SIGNATURE ERROR. Bot dijeda untuk perbaikan otomatis.');

    await sendTelegramMessage(
        `🚨 *Signature Error Terdeteksi!* 🚨\n\nAkun: \`${bot.userIdentifier}\`\n\nBot dijeda dan akan mencoba memperbarui signature secara otomatis. Mohon tunggu...`
    );

    try {
        // Langkah 1: Jalankan fungsi update untuk menulis file baru
        await updateSignature();

        // Langkah 2: Muat ulang konfigurasi yang baru ditulis ke dalam memori
        await loadSignatureConfig();

        logger.info('Memverifikasi signature baru dengan mencoba terhubung...');
        const response = await api.getState();
        if (!response.ok) {
            throw new Error('Verifikasi signature baru gagal. Masih mendapatkan error.');
        }

        logger.success('Signature berhasil diperbarui! Bot akan melanjutkan operasi.');
        await sendTelegramMessage(
            `✅ *Signature Berhasil Diperbarui!* ✅\n\nAkun: \`${bot.userIdentifier}\`\n\nBot akan melanjutkan operasi secara normal.`
        );

        bot.isPausedForSignature = false;
        await bot.initializeSlots(response.state);

    } catch (error) {
        logger.error(`Perbaikan signature otomatis GAGAL: ${error.message}`);
        await sendTelegramMessage(
            `❌ *Perbaikan Signature Gagal!* ❌\n\nAkun: \`${bot.userIdentifier}\`\n\nBot tidak dapat memperbaiki masalah secara otomatis. Bot akan berhenti. Mohon periksa log.`
        );
        bot.stop();
    }
}
