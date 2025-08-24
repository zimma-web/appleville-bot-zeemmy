// =================================================================
// ACTION HANDLERS
// Berisi logika untuk aksi utama bot: panen, tanam, dan booster.
// =================================================================

import { logger } from '../../utils/logger.js';
import { api, CaptchaError } from '../../services/api.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function inventoryCount(state, key) {
    const item = (state?.items || []).find(i => i.key === key);
    return item?.quantity || 0;
}

// [LOGIKA BARU] Fungsi terpusat yang sepenuhnya anti-race condition
async function purchaseItemIfNeeded(bot, itemType) {
    const isSeed = itemType === 'seed';
    const lock = isSeed ? 'isBuyingSeed' : 'isBuyingBooster';
    const key = isSeed ? bot.config.seedKey : bot.config.boosterKey;
    const buyQty = isSeed ? bot.config.seedBuyQty : bot.config.boosterBuyQty;

    // Jika proses lain sedang membeli, tunggu dengan sabar.
    if (bot[lock]) {
        logger.debug(`Pembelian ${itemType} sudah berjalan, proses ini menunggu...`);
        while (bot[lock]) {
            await sleep(500);
        }
        return; // Setelah menunggu, stok seharusnya sudah ada.
    }

    try {
        // Ambil kunci terlebih dahulu untuk mencegah proses lain masuk.
        bot[lock] = true;

        // Setelah mendapatkan kunci, periksa apakah pembelian masih diperlukan.
        const { state } = await api.getState();
        if (inventoryCount(state, key) < 1) {
            logger.warn(`${isSeed ? 'Bibit' : 'Booster'} ${key} habis. Membeli ${buyQty}...`);
            const buyResult = await api.buyItem(key, buyQty);
            if (!buyResult.ok) {
                throw new Error(`Gagal membeli ${itemType}.`);
            }
            logger.success(`Berhasil membeli ${itemType}.`);
        } else {
            logger.debug(`Stok ${itemType} sudah ada, pembelian dibatalkan.`);
        }
    } finally {
        // Apapun yang terjadi, selalu lepaskan kunci.
        bot[lock] = false;
    }
}


export async function handleHarvest(bot, slotIndex, retryCount = 0) {
    if (!bot.isRunning || bot.isPausedForCaptcha) return;
    bot.plantTimers.delete(slotIndex);
    bot.slotStates.delete(slotIndex);

    try {
        logger.action('harvest', `Memanen slot ${slotIndex}...`);
        const result = await api.harvestSlot(slotIndex);
        if (result.ok) {
            const earnings = result.data.plotResults[0];
            const coins = Math.round(earnings.coinsEarned || 0);
            const ap = Math.round(earnings.apEarned || 0);
            const xp = Math.round(earnings.xpGained || 0);
            let logMessage = `Slot ${slotIndex} dipanen: +${coins} koin`;
            if (ap > 0) logMessage += `, +${ap} AP`;
            logMessage += `, +${xp} XP.`;
            logger.success(logMessage);
            await sleep(500);
            await handlePlanting(bot, slotIndex);
        } else {
            throw new Error(result.error?.message || 'Unknown harvest error');
        }
    } catch (error) {
        if (error instanceof CaptchaError) return bot.handleCaptchaRequired();
        if (retryCount < 3) {
            const nextAttempt = retryCount + 1;
            logger.error(`Gagal memanen slot ${slotIndex}. Mencoba lagi... (${nextAttempt}/3)`);
            setTimeout(() => handleHarvest(bot, slotIndex, nextAttempt), 5000);
        } else {
            logger.error(`Gagal total memanen slot ${slotIndex} setelah 3 percobaan.`);
        }
    }
}

export async function handlePlanting(bot, slotIndex, retryCount = 0) {
    if (!bot.isRunning || bot.isPausedForCaptcha) return;

    try {
        // [DIUBAH] Selalu pastikan stok ada sebelum menanam
        await purchaseItemIfNeeded(bot, 'seed');

        logger.action('plant', `Menanam di slot ${slotIndex}...`);
        const plantResult = await api.plantSeed(slotIndex, bot.config.seedKey);
        if (plantResult.ok) {
            const newEndsAt = new Date(plantResult.data.plotResults[0].endsAt).getTime();
            bot.setHarvestTimer(slotIndex, newEndsAt);
            logger.success(`Slot ${slotIndex} ditanami ${bot.config.seedKey}.`);

            if (bot.config.boosterKey) {
                await sleep(500);
                await handleBoosterApplication(bot, slotIndex);
            }
        } else {
            // Jika gagal karena race condition (slot lain memakai bibit terakhir), coba lagi.
            if (plantResult.error?.message?.includes('Not enough')) {
                logger.warn(`Slot ${slotIndex} gagal tanam karena bibit habis (race condition). Mencoba lagi segera.`);
                setTimeout(() => handlePlanting(bot, slotIndex, 0), 500);
                return;
            }
            throw new Error(plantResult.error?.message || 'Unknown planting error');
        }
    } catch (error) {
        if (error instanceof CaptchaError) return bot.handleCaptchaRequired();
        if (retryCount < 3) {
            const nextAttempt = retryCount + 1;
            logger.error(`Gagal menanam di slot ${slotIndex}: ${error.message}. Mencoba lagi... (${nextAttempt}/3)`);
            setTimeout(() => handlePlanting(bot, slotIndex, nextAttempt), 5000);
        } else {
            logger.error(`Gagal total menanam di slot ${slotIndex} setelah 3 percobaan.`);
        }
    }
}

export async function handleBoosterApplication(bot, slotIndex, retryCount = 0) {
    if (!bot.isRunning || !bot.config.boosterKey || bot.isPausedForCaptcha) return;

    try {
        const { state } = await api.getState();
        const currentSlot = state.plots.find(p => p.slotIndex === slotIndex);
        if (!currentSlot || !currentSlot.seed) return;
        if (currentSlot.modifier && new Date(currentSlot.modifier.endsAt).getTime() > Date.now()) {
            bot.setBoosterTimer(slotIndex, new Date(currentSlot.modifier.endsAt).getTime());
            return;
        }

        // [DIUBAH] Selalu pastikan stok ada sebelum memasang
        await purchaseItemIfNeeded(bot, 'booster');

        logger.action('boost', `Memasang booster di slot ${slotIndex}...`);
        const applyResult = await api.applyModifier(slotIndex, bot.config.boosterKey);
        if (applyResult.ok) {
            logger.success(`Booster ${bot.config.boosterKey} terpasang di slot ${slotIndex}.`);
            const { state: newState } = await api.getState();
            const updatedSlot = newState.plots.find(p => p.slotIndex === slotIndex);
            if (updatedSlot?.seed) {
                bot.setHarvestTimer(slotIndex, new Date(updatedSlot.seed.endsAt).getTime());
                logger.info(`Timer panen untuk slot ${slotIndex} disesuaikan.`);
            }
            if (updatedSlot?.modifier) {
                bot.setBoosterTimer(slotIndex, new Date(updatedSlot.modifier.endsAt).getTime());
            }
        } else {
            if (applyResult.error?.message?.includes('Not enough')) {
                logger.warn(`Slot ${slotIndex} gagal pasang booster karena habis (race condition). Mencoba lagi segera.`);
                setTimeout(() => handleBoosterApplication(bot, slotIndex, 0), 500);
                return;
            }
            throw new Error(applyResult.error?.message || 'Unknown booster application error');
        }
    } catch (error) {
        if (error instanceof CaptchaError) return bot.handleCaptchaRequired();
        if (retryCount < 3) {
            const nextAttempt = retryCount + 1;
            logger.error(`Gagal memasang booster di slot ${slotIndex}: ${error.message}. Mencoba lagi... (${nextAttempt}/3)`);
            setTimeout(() => handleBoosterApplication(bot, slotIndex, nextAttempt), 5000);
        } else {
            logger.error(`Gagal total memasang booster di slot ${slotIndex} setelah 3 percobaan.`);
        }
    }
}
