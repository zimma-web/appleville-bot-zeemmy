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
    if (bot.isBuyingSeed) {
        setTimeout(() => handlePlanting(bot, slotIndex), 2500);
        return;
    }
    try {
        logger.action('plant', `Menanam di slot ${slotIndex}...`);
        let { state } = await api.getState();
        if (inventoryCount(state, bot.config.seedKey) < 1) {
            bot.isBuyingSeed = true;
            logger.warn(`Bibit ${bot.config.seedKey} habis. Membeli ${bot.config.seedBuyQty}...`);
            const buyResult = await api.buyItem(bot.config.seedKey, bot.config.seedBuyQty);
            bot.isBuyingSeed = false;
            if (!buyResult.ok) throw new Error('Gagal membeli bibit.');
            logger.success('Berhasil membeli bibit.');
        }
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
            throw new Error(plantResult.error?.message || 'Unknown planting error');
        }
    } catch (error) {
        if (error instanceof CaptchaError) return bot.handleCaptchaRequired();
        if (bot.isBuyingSeed) bot.isBuyingSeed = false;
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
    if (bot.isBuyingBooster) {
        setTimeout(() => handleBoosterApplication(bot, slotIndex), 2500);
        return;
    }
    try {
        const { state } = await api.getState();
        const currentSlot = state.plots.find(p => p.slotIndex === slotIndex);
        if (!currentSlot || !currentSlot.seed) return;
        if (currentSlot.modifier && new Date(currentSlot.modifier.endsAt).getTime() > Date.now()) {
            bot.setBoosterTimer(slotIndex, new Date(currentSlot.modifier.endsAt).getTime());
            return;
        }
        logger.action('boost', `Memasang booster di slot ${slotIndex}...`);
        if (inventoryCount(state, bot.config.boosterKey) < 1) {
            bot.isBuyingBooster = true;
            logger.warn(`Booster ${bot.config.boosterKey} habis. Membeli ${bot.config.boosterBuyQty}...`);
            const buyResult = await api.buyItem(bot.config.boosterKey, bot.config.boosterBuyQty);
            bot.isBuyingBooster = false;
            if (!buyResult.ok) throw new Error('Gagal membeli booster.');
            logger.success('Berhasil membeli booster.');
        }
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
            throw new Error(applyResult.error?.message || 'Unknown booster application error');
        }
    } catch (error) {
        if (error instanceof CaptchaError) return bot.handleCaptchaRequired();
        if (bot.isBuyingBooster) bot.isBuyingBooster = false;
        if (retryCount < 3) {
            const nextAttempt = retryCount + 1;
            logger.error(`Gagal memasang booster di slot ${slotIndex}: ${error.message}. Mencoba lagi... (${nextAttempt}/3)`);
            setTimeout(() => handleBoosterApplication(bot, slotIndex, nextAttempt), 5000);
        } else {
            logger.error(`Gagal total memasang booster di slot ${slotIndex} setelah 3 percobaan.`);
        }
    }
}
