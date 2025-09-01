// =================================================================
// ACTION HANDLERS - RESPONSIVE BATCH MODE
// Logika untuk aksi bot: BATCH PROCESSING RESPONSIF dengan logika cerdas
// =================================================================

import { logger } from '../../utils/logger.js';
import { api, CaptchaError, SignatureError } from '../../services/api.js';
import { BATCH_SETTINGS, API_SETTINGS } from '../../config.js';
import { sendTelegramMessage } from '../../utils/telegram.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function inventoryCount(state, key) {
    const item = (state?.items || []).find(i => i.key === key);
    return item?.quantity || 0;
}

// [RESPONSIVE] Fungsi ini sekarang lebih tangguh terhadap race condition
async function purchaseItemIfNeeded(bot, itemType, quantityNeeded = 1) {
    const isSeed = itemType === 'seed';
    const lock = isSeed ? 'isBuyingSeed' : 'isBuyingBooster';
    const key = isSeed ? bot.config.seedKey : bot.config.boosterKey;
    const buyQty = isSeed ? Math.max(bot.config.seedBuyQty, quantityNeeded) : Math.max(bot.config.boosterBuyQty, quantityNeeded);

    if (bot[lock]) {
        logger.debug(`Pembelian ${itemType} sudah berjalan, proses ini menunggu...`);
        while (bot[lock]) {
            await sleep(200); // Delay minimal
        }
        // [RACE CONDITION FIX] Periksa lagi setelah menunggu
        const { state: newState } = await api.getState();
        if (inventoryCount(newState, key) >= quantityNeeded) {
            logger.debug(`Stok ${itemType} sudah dibeli oleh proses lain, pembelian dibatalkan.`);
            return;
        }
    }

    try {
        bot[lock] = true;

        const { state } = await api.getState();
        if (inventoryCount(state, key) < quantityNeeded) {
            logger.warn(`${isSeed ? 'Bibit' : 'Booster'} ${key} habis/kurang. Membeli ${buyQty}...`);
            const buyResult = await api.buyItem(key, buyQty);
            if (!buyResult.ok) {
                logger.error(`Gagal membeli ${itemType}: ${buyResult.error?.message || 'Unknown error'}`);
                return;
            }
            logger.success(`Berhasil membeli ${itemType}.`);
            await sleep(API_SETTINGS.PAUSE_MS);
        } else {
            logger.debug(`Stok ${itemType} sudah ada, pembelian dibatalkan.`);
        }
    } finally {
        bot[lock] = false;
    }
}

// [RESPONSIVE] Fungsi untuk memproses batch dengan kecepatan maksimal
async function processBatchInChunks(bot, items, processFunction, batchSize = 8, delay = API_SETTINGS.BATCH_DELAY) {
    const results = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const chunk = items.slice(i, i + batchSize);
        logger.debug(`Memproses batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)} (${chunk.length} item)`);
        
        // Proses satu per satu dengan delay minimal
        for (const item of chunk) {
            const result = await processFunction(item);
            results.push(result);
            // Delay minimal antar item dalam batch
            await sleep(50); // Hanya 50ms delay antar item
        }
        
        // Delay minimal antar batch
        if (i + batchSize < items.length) {
            await sleep(delay);
        }
    }
    return results;
}

// [RESPONSIVE] Fungsi untuk menampilkan informasi akun singkat dan kirim ke Telegram
async function displayAccountInfo(bot) {
    try {
        const { user, state } = await api.getState();
        if (!user || !state) return;

        const plots = state.plots.filter(p => bot.config.slots.includes(p.slotIndex));
        const activePlots = plots.filter(p => p.seed);
        const emptyPlots = plots.filter(p => !p.seed);
        const readyToHarvest = plots.filter(p => p.seed && new Date(p.seed.endsAt).getTime() <= Date.now());

        // Info untuk console
        logger.info('=== INFORMASI AKUN ===');
        logger.info(`💰 Saldo: ${user.coins || 0} koin | ${user.ap || 0} AP`);
        logger.info(`🌱 Slot Aktif: ${activePlots.length}/${plots.length} | 📦 Kosong: ${emptyPlots.length} | 🔪 Siap: ${readyToHarvest.length}`);
        
        // Inventory singkat
        const seedCount = inventoryCount(state, bot.config.seedKey);
        logger.info(`🌾 Stok ${bot.config.seedKey}: ${seedCount}`);
        
        // Next harvest time
        let nextHarvestTime = 'Tidak ada';
        if (activePlots.length > 0) {
            const nextHarvest = Math.min(...activePlots.map(p => new Date(p.seed.endsAt).getTime()));
            const timeUntilHarvest = Math.max(0, nextHarvest - Date.now());
            const minutes = Math.floor(timeUntilHarvest / 60000);
            const seconds = Math.floor((timeUntilHarvest % 60000) / 1000);
            nextHarvestTime = `${minutes}m ${seconds}s`;
            logger.info(`⏰ Panen berikutnya: ${nextHarvestTime}`);
        }
        
        logger.info('=====================');

        // [BARU] Kirim notifikasi ke Telegram
        const telegramMessage = `🌾 *BATCH CYCLE SELESAI* 🌾

💰 *Saldo Akun:*
• Koin: ${user.coins || 0}
• AP: ${user.ap || 0}

🌱 *Status Slot:*
• Aktif: ${activePlots.length}/${plots.length}
• Kosong: ${emptyPlots.length}
• Siap Panen: ${readyToHarvest.length}

🌾 *Inventory:*
• ${bot.config.seedKey}: ${seedCount}

⏰ *Panen Berikutnya:* ${nextHarvestTime}

🔄 *Waktu:* ${new Date().toLocaleString('id-ID')}`;

        await sendTelegramMessage(telegramMessage);
        
    } catch (error) {
        logger.warn(`Gagal mendapatkan informasi akun: ${error.message}`);
    }
}

export async function handleBatchCycle(bot, initialState = null) {
    if (!bot.isRunning || bot.isPausedForCaptcha || bot.isPausedForSignature || bot.isBatchCycleRunning) return;

    bot.isBatchCycleRunning = true;
    logger.info('🚀 Memulai siklus batch processing responsif...');

    try {
        const state = initialState || (await api.getState()).state;
        if (!state) throw new Error('Gagal mendapatkan state untuk batch cycle.');

        const now = Date.now();
        const plots = state.plots.filter(p => bot.config.slots.includes(p.slotIndex));

        logger.info(`📊 Status: ${plots.filter(p => p.seed).length} aktif, ${plots.filter(p => !p.seed).length} kosong`);

        // [RESPONSIVE BATCH MODE] URUTAN: TANAM → PANEN → TANAM LAGI
        
        // 1. TANAM SEMUA SLOT KOSONG SECEPATNYA
        const emptySlots = plots.filter(p => !p.seed);
        if (emptySlots.length > 0) {
            logger.action('plant', `🌱 Menanam di ${emptySlots.length} slot kosong...`);
            
            await purchaseItemIfNeeded(bot, 'seed', emptySlots.length);
            
            const plantResults = await processBatchInChunks(
                bot,
                emptySlots.map(p => ({ slotIndex: p.slotIndex, seedKey: bot.config.seedKey })),
                async (planting) => {
                    try {
                        const { state: currentState } = await api.getState();
                        const currentPlot = currentState.plots.find(p => p.slotIndex === planting.slotIndex);
                        
                        if (currentPlot && currentPlot.seed) {
                            return { slotIndex: planting.slotIndex, success: true, skipped: true, reason: 'Already planted' };
                        }
                        
                        const result = await api.plantSeed(planting.slotIndex, planting.seedKey);
                        return { slotIndex: planting.slotIndex, success: result.ok, data: result.data, skipped: false };
                    } catch (error) {
                        return { slotIndex: planting.slotIndex, success: false, error: error.message, skipped: false };
                    }
                },
                8, // Batch size besar untuk kecepatan
                API_SETTINGS.BATCH_DELAY
            );
            
            const successfulPlants = plantResults.filter(r => r.success && !r.skipped);
            const skippedPlants = plantResults.filter(r => r.skipped);
            
            if (successfulPlants.length > 0) {
                logger.success(`✅ Berhasil menanam di ${successfulPlants.length} slot.`);
            }
            if (skippedPlants.length > 0) {
                logger.info(`⏭️ ${skippedPlants.length} slot dilewati.`);
            }
        }

        // 2. PANEN SEMUA SLOT YANG SIAP SECEPATNYA
        const stateAfterPlanting = (await api.getState()).state;
        const plotsAfterPlanting = stateAfterPlanting.plots.filter(p => bot.config.slots.includes(p.slotIndex));
        const readyToHarvest = plotsAfterPlanting.filter(p => p.seed && new Date(p.seed.endsAt).getTime() <= now);
        
        if (readyToHarvest.length > 0) {
            logger.action('harvest', `🔪 Memanen ${readyToHarvest.length} slot...`);
            
            const harvestResults = await processBatchInChunks(
                bot,
                readyToHarvest.map(p => p.slotIndex),
                async (slotIndex) => {
                    try {
                        const { state: currentState } = await api.getState();
                        const currentPlot = currentState.plots.find(p => p.slotIndex === slotIndex);
                        
                        if (!currentPlot || !currentPlot.seed) {
                            return { slotIndex, success: true, skipped: true, reason: 'No plant' };
                        }
                        
                        if (new Date(currentPlot.seed.endsAt).getTime() > now) {
                            return { slotIndex, success: true, skipped: true, reason: 'Not ready' };
                        }
                        
                        const result = await api.harvestSlot(slotIndex);
                        return { slotIndex, success: result.ok, data: result.data, skipped: false };
                    } catch (error) {
                        return { slotIndex, success: false, error: error.message, skipped: false };
                    }
                },
                8, // Batch size besar untuk kecepatan
                API_SETTINGS.BATCH_DELAY
            );
            
            const successfulHarvests = harvestResults.filter(r => r.success && !r.skipped);
            if (successfulHarvests.length > 0) {
                logger.success(`✅ Berhasil memanen ${successfulHarvests.length} slot.`);
            }
        }

        // 3. [RESPONSIVE] TANAM LAGI DI SLOT YANG BARU DIPANEN
        const stateAfterHarvest = (await api.getState()).state;
        const plotsAfterHarvest = stateAfterHarvest.plots.filter(p => bot.config.slots.includes(p.slotIndex));
        const newlyEmptySlots = plotsAfterHarvest.filter(p => !p.seed);
        
        if (newlyEmptySlots.length > 0) {
            logger.action('plant', `🌱 Menanam lagi di ${newlyEmptySlots.length} slot yang baru dipanen...`);
            
            await purchaseItemIfNeeded(bot, 'seed', newlyEmptySlots.length);
            
            const replantResults = await processBatchInChunks(
                bot,
                newlyEmptySlots.map(p => ({ slotIndex: p.slotIndex, seedKey: bot.config.seedKey })),
                async (planting) => {
                    try {
                        const { state: currentState } = await api.getState();
                        const currentPlot = currentState.plots.find(p => p.slotIndex === planting.slotIndex);
                        
                        if (currentPlot && currentPlot.seed) {
                            return { slotIndex: planting.slotIndex, success: true, skipped: true, reason: 'Already planted' };
                        }
                        
                        const result = await api.plantSeed(planting.slotIndex, planting.seedKey);
                        return { slotIndex: planting.slotIndex, success: result.ok, data: result.data, skipped: false };
                    } catch (error) {
                        return { slotIndex: planting.slotIndex, success: false, error: error.message, skipped: false };
                    }
                },
                8, // Batch size besar untuk kecepatan
                API_SETTINGS.BATCH_DELAY
            );
            
            const successfulReplants = replantResults.filter(r => r.success && !r.skipped);
            if (successfulReplants.length > 0) {
                logger.success(`✅ Berhasil menanam lagi di ${successfulReplants.length} slot.`);
            }
        }

        // 4. BOOSTER (OPSIONAL) - DILEWATI UNTUK KECEPATAN
        if (bot.config.boosterKey) {
            logger.info(`⚡ Booster dilewati untuk kecepatan batch processing.`);
        }

        // [RESPONSIVE] Tampilkan info akun singkat
        await displayAccountInfo(bot);

    } catch (error) {
        if (error instanceof CaptchaError) return bot.handleCaptchaRequired();
        if (error instanceof SignatureError) return bot.handleSignatureError();
        logger.error(`❌ Error batch: ${error.message}`);
    } finally {
        bot.isBatchCycleRunning = false;
        logger.info(`🔄 Batch cycle responsif selesai!`);
        bot.refreshAllTimers();
    }
}

// [DISABLED] Individual handlers - gunakan batch processing saja
export async function handleHarvest(bot, slotIndex) {
    logger.debug(`Individual harvest dinonaktifkan untuk slot ${slotIndex}. Gunakan batch processing.`);
    return;
}

export async function handlePlanting(bot, slotIndex) {
    logger.debug(`Individual planting dinonaktifkan untuk slot ${slotIndex}. Gunakan batch processing.`);
    return;
}

export async function handleBoosterApplication(bot, slotIndex) {
    logger.debug(`Individual booster dinonaktifkan untuk slot ${slotIndex}. Gunakan batch processing.`);
    return;
}
