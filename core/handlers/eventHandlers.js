// =================================================================
// EVENT HANDLERS
// Berisi logika untuk menangani event khusus seperti CAPTCHA dan prestige.
// =================================================================

import { logger } from '../../utils/logger.js';
import { api, CaptchaError } from '../../services/api.js';
import { PRESTIGE_LEVELS } from '../../config.js';
import { sendTelegramMessage } from '../../utils/telegram.js';

let TELEGRAM_SETTINGS = { ENABLED: false, CAPTCHA_RETRY_INTERVAL: 120000 };
try {
    const config = await import('../../telegram-config.js');
    TELEGRAM_SETTINGS = config.TELEGRAM_SETTINGS;
} catch (error) { }

export async function handleCaptchaRequired(bot) {
    if (bot.isPausedForCaptcha) return;
    bot.isPausedForCaptcha = true;

    logger.error('CAPTCHA DIBUTUHKAN. Bot dijeda.');
    logger.info('Silakan selesaikan CAPTCHA di browser. Bot akan mencoba lagi secara otomatis.');

    const message = `🚨 *CAPTCHA Dibutuhkan!* 🚨\n\nAkun: \`${bot.userIdentifier}\`\n\nBot AppleVille dijeda. Mohon selesaikan CAPTCHA di browser.`;
    await sendTelegramMessage(message);

    bot.plantTimers.forEach(timer => clearTimeout(timer));
    bot.boosterTimers.forEach(timer => clearTimeout(timer));

    bot.captchaCheckInterval = setInterval(
        () => checkForCaptchaResolution(bot),
        TELEGRAM_SETTINGS.CAPTCHA_RETRY_INTERVAL
    );
}

async function checkForCaptchaResolution(bot) {
    logger.info('Mencoba memeriksa status CAPTCHA...');
    try {
        await api.getState();
        logger.success('CAPTCHA sepertinya sudah diselesaikan!');

        const message = `✅ *CAPTCHA Selesai!* ✅\n\nAkun: \`${bot.userIdentifier}\`\n\nBot AppleVille akan melanjutkan operasi.`;
        await sendTelegramMessage(message);

        clearInterval(bot.captchaCheckInterval);
        bot.isPausedForCaptcha = false;
        const { state } = await api.getState();
        await bot.initializeSlots(state);
    } catch (error) {
        if (error instanceof CaptchaError) {
            logger.warn('CAPTCHA masih aktif. Mencoba lagi nanti...');
        } else {
            logger.error(`Terjadi error saat memeriksa CAPTCHA: ${error.message}`);
        }
    }
}

export async function checkPrestigeUpgrade(bot) {
    if (!bot.isRunning || bot.isPausedForCaptcha) return;

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
        if (!(error instanceof CaptchaError)) {
            logger.warn(`Gagal memeriksa upgrade prestige: ${error.message}`);
        }
    }
}
