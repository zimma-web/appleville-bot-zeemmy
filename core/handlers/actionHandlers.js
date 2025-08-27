// =================================================================
// ACTION HANDLERS (IMPROVED)
// Berisi logika untuk aksi utama bot dengan dukungan transisi mode.
// =================================================================

import { logger } from '../../utils/logger.js';
import { api, CaptchaError, SignatureError } from '../../services/api.js';
import { BATCH_SETTINGS } from '../../config.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function inventoryCount(state, key) {
    const item = (state?.items || []).find(i => i.key === key);
    return item?.quantity || 0;
}

async function purchaseItemIfNeeded(bot, itemType, quantityNeeded = 1) {
    if (!bot.isRunning || bot.isPausedForCaptcha || bot.isPausedForSignature) return;

    const isSeed = itemType === 'seed';
    const lock = isSeed ? 'isBuyingSeed' : 'isBuyingBooster';
    const key = isSeed ? bot.config.seedKey : bot.config.boosterKey;
    const buyQty = isSeed ? Math.max(bot.config.seedBuyQty, quantityNeeded) : Math.max(bot.config.boosterBuyQty, quantityNeeded);

    if (bot[lock]) {
        logger.debug(`Pembelian ${itemType} sudah berjalan, proses ini menunggu...`);
        while (bot[lock]) {
            await sleep(500);
        }
        return;
    }

    try {
        bot[lock] = true;
        const { state } = await api.getState();
        if (inventoryCount(state, key) < quantityNeeded) {
            logger.warn(`${isSeed ? 'Bibit' : 'Booster'} ${key} habis/kurang. Membeli ${buyQty}...`);
            const buyResult = await api.buyItem(key, buyQty);
            if (!buyResult.ok) {
                throw new Error(`Gagal membeli ${itemType}: ${buyResult.error?.message}`);
            }
            logger.success(`Berhasil membeli ${itemType}.`);
        } else {
            logger.debug(`Stok ${itemType} sudah ada, pembelian dibatalkan.`);
        }
    } finally {
        bot[lock] = false;
    }
}

export async function handleBatchCycle(bot, initialState = null) {
    if (bot.isBatchCycleRunning) {
        logger.debug('Siklus batch sudah berjalan, panggilan ini diabaikan.');
        return;
    }
    if (!bot.isRunning || bot.isPausedForCaptcha || bot.isPausedForSignature) return;

    try {
        bot.isBatchCycleRunning = true;

        logger.info('🔄 Memulai siklus batch...');
        let currentState = initialState ? initialState : (await api.getState()).state;
        if (!currentState) {
            logger.warn('Gagal mendapatkan state, siklus batch dibatalkan.');
            return;
        }

        const now = Date.now();
        let plots = currentState.plots.filter(p => bot.config.slots.includes(p.slotIndex));

        const readyToHarvest = plots
            .filter(p => p.seed && new Date(p.seed.endsAt).getTime() <= now)
            .map(p => p.slotIndex);

        if (readyToHarvest.length > 0) {
            logger.action('harvest', `🌾 Memanen ${readyToHarvest.length} slot secara massal...`);
            const harvestResult = await api.harvestMultiple(readyToHarvest);
            if (harvestResult.ok) {
                const totalCoins = harvestResult.data.plotResults.reduce((sum, p) => sum + (p.coinsEarned || 0), 0);
                const totalAp = harvestResult.data.plotResults.reduce((sum, p) => sum + (p.apEarned || 0), 0);
                logger.success(`Panen massal berhasil: +${Math.round(totalCoins)} koin, +${Math.round(totalAp)} AP.`);
            } else {
                logger.error(`Gagal melakukan panen massal: ${harvestResult.error?.message}`);
            }
            await sleep(1000);
            currentState = (await api.getState()).state;
            if (!currentState) { return; }
        }

        plots = currentState.plots.filter(p => bot.config.slots.includes(p.slotIndex));
        const emptySlots = plots.filter(p => !p.seed).map(p => p.slotIndex);

        if (emptySlots.length > 0) {
            await purchaseItemIfNeeded(bot, 'seed', emptySlots.length);
            logger.action('plant', `🌱 Menanam di ${emptySlots.length} slot secara massal...`);
            const plantings = emptySlots.map(slotIndex => ({ slotIndex, seedKey: bot.config.seedKey }));
            const plantResult = await api.plantMultiple(plantings);

            if (plantResult.ok) {
                logger.success(`Berhasil menanam di ${plantResult.data.plotResults.length} slot.`);
            } else {
                logger.error(`Gagal melakukan penanaman massal: ${plantResult.error?.message}`);
            }
            await sleep(1000);
            currentState = (await api.getState()).state;
            if (!currentState) { return; }
        }

        if (bot.config.boosterKey) {
            plots = currentState.plots.filter(p => bot.config.slots.includes(p.slotIndex));
            const slotsToBoost = plots.filter(p => p.seed && !p.modifier).map(p => p.slotIndex);

            if (slotsToBoost.length > 0) {
                logger.info(`⚡ Memeriksa kebutuhan booster untuk ${slotsToBoost.length} slot...`);
                for (const slotIndex of slotsToBoost) {
                    await handleBoosterApplication(bot, slotIndex);
                    await sleep(500);
                }
            }
        }

        await bot.refreshAllTimers();

    } catch (error) {
        if (error instanceof CaptchaError) return bot.handleCaptchaRequired();
        if (error instanceof SignatureError) return bot.handleSignatureError();
        logger.error(`Terjadi error pada siklus batch: ${error.message}`);
    } finally {
        bot.isBatchCycleRunning = false;
    }
}

export async function handleHarvest(bot, slotIndex) {
    if (!bot.isRunning || bot.isPausedForCaptcha || bot.isPausedForSignature) return;
    bot.plantTimers.delete(slotIndex);
    bot.slotStates.delete(slotIndex);

    for (let attempt = 1; attempt <= 3; attempt++) {
        if (!bot.isRunning || bot.isPausedForCaptcha || bot.isPausedForSignature) return;

        try {
            logger.action('harvest', `🌾 Memanen slot ${slotIndex}...`);
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

                // [PERBAIKAN] Cek apakah perlu transisi ke batch mode setelah panen
                if (bot.isInTransitionMode && BATCH_SETTINGS.ENABLED_SEEDS.includes(bot.config.seedKey)) {
                    // Jika dalam mode transisi, cek apakah masih ada tanaman lama
                    const { state } = await api.getState();
                    const plots = state.plots.filter(p => bot.config.slots.includes(p.slotIndex));
                    const hasOldCrops = plots.some(p =>
                        p.seed &&
                        p.seed.key !== bot.config.seedKey &&
                        new Date(p.seed.endsAt).getTime() > Date.now()
                    );

                    if (!hasOldCrops) {
                        // Tidak ada tanaman lama lagi, trigger transisi
                        logger.info('🎯 Slot terakhir dengan tanaman lama telah dipanen. Memicu transisi ke batch...');
                        bot.handleTransitionToBatch();
                        return; // Jangan lanjut ke planting individual
                    }
                }

                await handlePlanting(bot, slotIndex);
                return; // Berhasil, keluar dari loop
            } else {
                throw new Error(result.error?.message || 'Unknown harvest error');
            }
        } catch (error) {
            if (error instanceof CaptchaError) return bot.handleCaptchaRequired();
            if (error instanceof SignatureError) return bot.handleSignatureError();

            logger.error(`Gagal memanen slot ${slotIndex}: ${error.message}. Mencoba lagi... (${attempt}/3)`);
            if (attempt < 3) {
                await sleep(5000);
            } else {
                logger.error(`Gagal total memanen slot ${slotIndex} setelah 3 percobaan.`);
            }
        }
    }
}

export async function handlePlanting(bot, slotIndex) {
    if (!bot.isRunning || bot.isPausedForCaptcha || bot.isPausedForSignature) return;

    for (let attempt = 1; attempt <= 3; attempt++) {
        if (!bot.isRunning || bot.isPausedForCaptcha || bot.isPausedForSignature) return;

        try {
            await purchaseItemIfNeeded(bot, 'seed');

            logger.action('plant', `🌱 Menanam di slot ${slotIndex}...`);
            const plantResult = await api.plantSeed(slotIndex, bot.config.seedKey);
            if (plantResult.ok) {
                const newEndsAt = new Date(plantResult.data.plotResults[0].endsAt).getTime();
                bot.setHarvestTimer(slotIndex, newEndsAt);
                logger.success(`Slot ${slotIndex} ditanami ${bot.config.seedKey}.`);

                if (bot.config.boosterKey) {
                    await sleep(500);
                    await handleBoosterApplication(bot, slotIndex);
                }
                return; // Berhasil, keluar dari loop
            } else {
                throw new Error(plantResult.error?.message || 'Unknown planting error');
            }
        } catch (error) {
            if (error instanceof CaptchaError) return bot.handleCaptchaRequired();
            if (error instanceof SignatureError) return bot.handleSignatureError();

            logger.error(`Gagal menanam di slot ${slotIndex}: ${error.message}. Mencoba lagi... (${attempt}/3)`);
            if (attempt < 3) {
                await sleep(5000);
            } else {
                logger.error(`Gagal total menanam di slot ${slotIndex} setelah 3 percobaan.`);
            }
        }
    }
}

export async function handleBoosterApplication(bot, slotIndex) {
    if (!bot.isRunning || !bot.config.boosterKey || bot.isPausedForCaptcha || bot.isPausedForSignature) return;

    for (let attempt = 1; attempt <= 3; attempt++) {
        if (!bot.isRunning || bot.isPausedForCaptcha || bot.isPausedForSignature) return;

        try {
            const { state } = await api.getState();
            const currentSlot = state.plots.find(p => p.slotIndex === slotIndex);
            if (!currentSlot || !currentSlot.seed) return;
            if (currentSlot.modifier && new Date(currentSlot.modifier.endsAt).getTime() > Date.now()) {
                bot.setBoosterTimer(slotIndex, new Date(currentSlot.modifier.endsAt).getTime());
                return;
            }

            await purchaseItemIfNeeded(bot, 'booster');

            logger.action('boost', `⚡ Memasang booster di slot ${slotIndex}...`);
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
                return; // Berhasil, keluar dari loop
            } else {
                throw new Error(applyResult.error?.message || 'Unknown booster application error');
            }
        } catch (error) {
            if (error instanceof CaptchaError) return bot.handleCaptchaRequired();
            if (error instanceof SignatureError) return bot.handleSignatureError();

            logger.error(`Gagal memasang booster di slot ${slotIndex}: ${error.message}. Mencoba lagi... (${attempt}/3)`);
            if (attempt < 3) {
                await sleep(5000);
            } else {
                logger.error(`Gagal total memasang booster di slot ${slotIndex} setelah 3 percobaan.`);
            }
        }
    }
}