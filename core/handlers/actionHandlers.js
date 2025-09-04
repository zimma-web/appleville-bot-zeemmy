// =================================================================
// ACTION HANDLERS - ULTRA RESPONSIVE BATCH MODE
// Logika untuk aksi bot: BATCH PROCESSING 100% RESPONSIF - SLOT TIDAK BOLEH TURUN
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

// [ULTRA RESPONSIVE] Fungsi ini sekarang lebih tangguh terhadap race condition
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

// [ULTRA FAST] Fungsi untuk memproses batch dengan kecepatan maksimal
async function processBatchInChunks(bot, items, processFunction, batchSize = 12, delay = API_SETTINGS.BATCH_DELAY) {
    const results = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const chunk = items.slice(i, i + batchSize);
        logger.debug(`Memproses batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)} (${chunk.length} item)`);
        
        // Proses satu per satu dengan delay minimal
        for (const item of chunk) {
            const result = await processFunction(item);
            results.push(result);
            // Delay minimal antar item dalam batch
            await sleep(5); // Hanya 5ms delay antar item
        }
        
        // Delay minimal antar batch
        if (i + batchSize < items.length) {
            await sleep(delay);
        }
    }
    return results;
}

// [ULTRA RESPONSIVE] Fungsi untuk menampilkan informasi akun singkat dan kirim ke Telegram
async function displayAccountInfo(bot, batchCount = 0) {
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
        const boosterCount = bot.config.boosterKey ? inventoryCount(state, bot.config.boosterKey) : 0;
        logger.info(`🌾 Stok ${bot.config.seedKey}: ${seedCount}`);
        if (bot.config.boosterKey) {
            logger.info(`⚡ Stok ${bot.config.boosterKey}: ${boosterCount}`);
        }
        
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

        // [BARU] Kirim notifikasi ke Telegram - lebih lengkap setiap 10 batch
        let telegramMessage;
        if (batchCount > 0 && batchCount % 10 === 0) {
            // Pesan lengkap setiap 10 batch
            const totalXP = user.xp || 0;
            const prestigeLevel = user.prestigeLevel || 0;
            const nextPrestigeAP = user.prestigeLevel < 7 ? (user.prestigeLevel + 1) * 150000 : 'MAX';
            
            telegramMessage = `🎯 *BATCH CYCLE #${batchCount} - LAPORAN LENGKAP* 🎯

👤 *Info Akun:*
• Wallet: \`${user.rewardWalletAddress || 'Unknown'}\`
• XP: ${totalXP.toLocaleString()}
• Prestige: Level ${prestigeLevel}
• Next Prestige: ${nextPrestigeAP} AP

💰 *Saldo & Resources:*
• Koin: ${(user.coins || 0).toLocaleString()}
• AP: ${(user.ap || 0).toLocaleString()}

🌱 *Status Farming:*
• Slot Aktif: ${activePlots.length}/${plots.length}
• Slot Kosong: ${emptyPlots.length}
• Siap Panen: ${readyToHarvest.length}
• Seed: ${bot.config.seedKey}
• Booster: ${bot.config.boosterKey || 'None'}

📦 *Inventory:*
• ${bot.config.seedKey}: ${seedCount}
${bot.config.boosterKey ? `• ${bot.config.boosterKey}: ${boosterCount}` : ''}

⏰ *Timing:*
• Panen Berikutnya: ${nextHarvestTime}
• Batch Cycle: #${batchCount}

🔄 *Waktu:* ${new Date().toLocaleString('id-ID')}`;
        } else {
            // Pesan singkat untuk batch biasa
            telegramMessage = `🌾 *Batch #${batchCount}* 🌾

💰 Koin: ${(user.coins || 0).toLocaleString()} | AP: ${(user.ap || 0).toLocaleString()}
🌱 ${activePlots.length}/${plots.length} aktif | 🔪 ${readyToHarvest.length} siap
⏰ ${nextHarvestTime}

${new Date().toLocaleString('id-ID')}`;
        }

        await sendTelegramMessage(telegramMessage);
        
    } catch (error) {
        logger.warn(`Gagal mendapatkan informasi akun: ${error.message}`);
    }
}

export async function handleBatchCycle(bot, initialState = null, batchCount = 0) {
    if (!bot.isRunning || bot.isPausedForCaptcha || bot.isPausedForSignature || bot.isBatchCycleRunning) return;

    bot.isBatchCycleRunning = true;
    logger.info('🚀 Batch cycle dimulai...');

    try {
        const state = initialState || (await api.getState()).state;
        if (!state) throw new Error('Gagal mendapatkan state untuk batch cycle.');

        const now = Date.now();
        const plots = state.plots.filter(p => bot.config.slots.includes(p.slotIndex));
        const targetSlotCount = bot.config.slots.length; // Target: 12 slot

        logger.info(`📊 ${plots.filter(p => p.seed).length}/${targetSlotCount} aktif`);

        // [FIXED BATCH MODE] URUTAN: PANEN YANG SIAP → TANAM SEMUA KOSONG → BOOSTER
        
        // 1. [CONSISTENT] PANEN SEMUA 12 SLOT SEKALIGUS (cek yang siap, skip yang belum)
        const activePlots = plots.filter(p => p.seed);
        const readyToHarvest = activePlots.filter(p => new Date(p.seed.endsAt).getTime() <= now);
        const notReadyToHarvest = activePlots.filter(p => new Date(p.seed.endsAt).getTime() > now);
        
        // Selalu panen 12 slot sekaligus untuk konsistensi
        if (activePlots.length > 0) {
            logger.action('harvest', `🔪 Memanen 12 slot...`);
            
            const harvestResults = await processBatchInChunks(
                bot,
                bot.config.slots, // Selalu proses semua 12 slot
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
                12, // Batch size 12 untuk konsistensi
                API_SETTINGS.BATCH_DELAY
            );
            
            const successfulHarvests = harvestResults.filter(r => r.success && !r.skipped);
            const skippedHarvests = harvestResults.filter(r => r.skipped);
            
            if (successfulHarvests.length > 0) {
                logger.success(`✅ Panen ${successfulHarvests.length} slot`);
            }
            if (skippedHarvests.length > 0) {
                logger.info(`⏭️ ${skippedHarvests.length} slot belum siap`);
            }
        }
        
        // 2. [CONSISTENT] TANAM SEMUA 12 SLOT SEKALIGUS (setelah panen)
        const stateAfterHarvest = (await api.getState()).state;
        const plotsAfterHarvest = stateAfterHarvest.plots.filter(p => bot.config.slots.includes(p.slotIndex));
        const emptySlots = plotsAfterHarvest.filter(p => !p.seed);
        
        // Selalu tanam 12 slot sekaligus untuk konsistensi
        if (emptySlots.length > 0) {
            logger.action('plant', `🌱 Menanam 12 slot...`);
            
            await purchaseItemIfNeeded(bot, 'seed', 12);
            
            const plantResults = await processBatchInChunks(
                bot,
                bot.config.slots.map(slotIndex => ({ slotIndex, seedKey: bot.config.seedKey })),
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
                12, // Batch size 12 untuk konsistensi
                API_SETTINGS.BATCH_DELAY
            );
            
            const successfulPlants = plantResults.filter(r => r.success && !r.skipped);
            const skippedPlants = plantResults.filter(r => r.skipped);
            
            if (successfulPlants.length > 0) {
                logger.success(`✅ Tanam ${successfulPlants.length} slot`);
            }
            if (skippedPlants.length > 0) {
                logger.info(`⏭️ ${skippedPlants.length} slot sudah ditanam`);
            }
        }
        
        // 3. CEK APAKAH PERLU TUNGGU ATAU LANGSUNG BOOSTER
        // Jika masih ada tanaman yang belum siap, tunggu dulu
        const finalState = (await api.getState()).state;
        const finalPlots = finalState.plots.filter(p => bot.config.slots.includes(p.slotIndex));
        const finalActivePlots = finalPlots.filter(p => p.seed);
        const finalNotReady = finalActivePlots.filter(p => new Date(p.seed.endsAt).getTime() > now);
        
        if (finalNotReady.length > 0) {
            const nextHarvestTime = Math.min(...finalNotReady.map(p => new Date(p.seed.endsAt).getTime()));
            const timeUntilHarvest = nextHarvestTime - now;
            const minutes = Math.floor(timeUntilHarvest / 60000);
            const seconds = Math.floor((timeUntilHarvest % 60000) / 1000);
            
            logger.info(`⏳ Menunggu ${finalNotReady.length} slot siap... (${minutes}m ${seconds}s)`);
            return; // Keluar dari batch cycle, tunggu batch berikutnya
        }

        // 4. [CONSISTENT] TERAPKAN BOOSTER KE SEMUA 12 SLOT
        if (bot.config.boosterKey) {
            const stateAfterPlant = (await api.getState()).state;
            const plotsAfterPlant = stateAfterPlant.plots.filter(p => bot.config.slots.includes(p.slotIndex));
            const activePlotsForBooster = plotsAfterPlant.filter(p => p.seed && !p.modifier);
            
            if (activePlotsForBooster.length > 0) {
                logger.action('booster', `⚡ Booster 12 slot...`);
                
                await purchaseItemIfNeeded(bot, 'booster', 12);
                
                const boosterResults = await processBatchInChunks(
                    bot,
                    bot.config.slots.map(slotIndex => ({ slotIndex, boosterKey: bot.config.boosterKey })),
                    async (boosting) => {
                        try {
                            const { state: currentState } = await api.getState();
                            const currentPlot = currentState.plots.find(p => p.slotIndex === boosting.slotIndex);
                            
                            if (!currentPlot || !currentPlot.seed) {
                                return { slotIndex: boosting.slotIndex, success: true, skipped: true, reason: 'No plant' };
                            }
                            
                            if (currentPlot.modifier) {
                                return { slotIndex: boosting.slotIndex, success: true, skipped: true, reason: 'Already boosted' };
                            }
                            
                            const result = await api.applyModifier(boosting.slotIndex, boosting.boosterKey);
                            return { slotIndex: boosting.slotIndex, success: result.ok, data: result.data, skipped: false };
                        } catch (error) {
                            return { slotIndex: boosting.slotIndex, success: false, error: error.message, skipped: false };
                        }
                    },
                    12, // Batch size 12 untuk konsistensi
                    API_SETTINGS.BATCH_DELAY
                );
                
                const successfulBoosters = boosterResults.filter(r => r.success && !r.skipped);
                const skippedBoosters = boosterResults.filter(r => r.skipped);
                
                if (successfulBoosters.length > 0) {
                    logger.success(`✅ Booster ${successfulBoosters.length} slot`);
                }
                if (skippedBoosters.length > 0) {
                    logger.info(`⏭️ ${skippedBoosters.length} slot sudah di-booster`);
                }
            } else {
                logger.info(`⚡ Semua slot sudah memiliki booster atau tidak ada slot aktif.`);
            }
        }

        // 5. [FULL CYCLE] Tampilkan info akun singkat
        await displayAccountInfo(bot, batchCount);

        // 6. [FULL CYCLE] VERIFIKASI FINAL - PASTIKAN 12 SLOT AKTIF
        const verificationState = (await api.getState()).state;
        const verificationPlots = verificationState.plots.filter(p => bot.config.slots.includes(p.slotIndex));
        const verificationActiveSlots = verificationPlots.filter(p => p.seed);
        
        if (verificationActiveSlots.length === targetSlotCount) {
            logger.success(`🎯 ${verificationActiveSlots.length}/${targetSlotCount} aktif`);
        }

    } catch (error) {
        if (error instanceof CaptchaError) return bot.handleCaptchaRequired();
        if (error instanceof SignatureError) return bot.handleSignatureError();
        logger.error(`❌ Error batch: ${error.message}`);
    } finally {
        bot.isBatchCycleRunning = false;
        logger.info(`🔄 Batch selesai`);
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
