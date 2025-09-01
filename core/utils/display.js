// =================================================================
// DISPLAY UTILITY - BATCH ONLY MODE
// Mengelola pembaruan status yang ditampilkan di konsol untuk mode batch.
// =================================================================

import { updateLine } from '../../utils/logger.js';
import { BATCH_SETTINGS } from '../../config.js';

export function displayStatus(bot) {
    if (bot.isPausedForCaptcha) {
        updateLine(`⏸️ Bot dijeda untuk akun ${bot.userIdentifier}. Menunggu CAPTCHA diselesaikan...`);
        return;
    }

    if (bot.isPausedForSignature) {
        updateLine(`⏸️ Bot dijeda untuk akun ${bot.userIdentifier}. Error signature terdeteksi.`);
        return;
    }

    // [BATCH ONLY MODE] Tampilkan status batch processing
    if (bot.isBatchCycleRunning) {
        updateLine(`🚀 Batch cycle sedang berjalan...`);
        return;
    }

    // Tampilkan jumlah total slot yang dikonfigurasi
    const farmingCount = bot.config.slots.length;
    updateLine(`🌱 Farming ${farmingCount} slots | Mode: Batch Processing`);
}
