// =================================================================
// ACTION HANDLERS - BATCH ONLY MODE
// Logika untuk aksi bot: HANYA BATCH PROCESSING, TIDAK ADA INDIVIDUAL
// =================================================================

import { logger } from '../../utils/logger.js';
import { api, CaptchaError, SignatureError } from '../../services/api.js';
import { BATCH_SETTINGS, API_SETTINGS } from '../../config.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function inventoryCount(state, key) {
    const item = (state?.items || []).find(i => i.key === key);
    return item?.quantity || 0;
}

// [FIXED] Fungsi ini sekarang lebih tangguh terhadap race condition
async function purchaseItemIfNeeded(bot, itemType, quantityNeeded = 1) {
    const isSeed = itemType === 'seed';
    const lock = isSeed ? 'isBuyingSeed' : 'isBuyingBooster';
    const key = isSeed ? bot.config.seedKey : bot.config.boosterKey;
    const buyQty = isSeed ? Math.max(bot.config.seedBuyQty, quantityNeeded) : Math.max(bot.config.boosterBuyQty, quantityNeeded);

    if (bot[lock]) {
        logger.debug(`Pembelian ${itemType} sudah berjalan, proses ini menunggu...`);
        while (bot[lock]) {
            await sleep(500);
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
                // Jangan lempar error agar tidak menghentikan bot total, cukup log
                logger.error(`Gagal membeli ${itemType}: ${buyResult.error?.message || 'Unknown error'}`);
                return; // Keluar jika pembelian gagal
            }
            logger.success(`Berhasil membeli ${itemType}.`);
            await sleep(API_SETTINGS.PAUSE_MS); // Tambah delay setelah pembelian
        } else {
            logger.debug(`Stok ${itemType} sudah ada, pembelian dibatalkan.`);
        }
    } finally {
        bot[lock] = false;
    }
}

// [BARU] Fungsi untuk memproses batch dalam ukuran yang lebih kecil
async function processBatchInChunks(bot, items, processFunction, batchSize = 3, delay = API_SETTINGS.BATCH_DELAY) {
    const results = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const chunk = items.slice(i, i + batchSize);
        logger.debug(`Memproses batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)} (${chunk.length} item)`);
        
        // Proses satu per satu untuk menghindari race condition
        for (const item of chunk) {
            const result = await processFunction(item);
            results.push(result);
            // Delay antar item dalam batch
            await sleep(API_SETTINGS.PAUSE_MS);
        }
        
        // Delay antar batch untuk menghindari rate limiting
        if (i + batchSize < items.length) {
            await sleep(delay);
        }
    }
    return results;
}

// [BARU] Fungsi untuk menampilkan informasi akun lengkap
async function displayAccountInfo(bot) {
    try {
        const { user, state } = await api.getState();
        if (!user || !state) return;

        const plots = state.plots.filter(p => bot.config.slots.includes(p.slotIndex));
        const activePlots = plots.filter(p => p.seed);
        const emptyPlots = plots.filter(p => !p.seed);
        const readyToHarvest = plots.filter(p => p.seed && new Date(p.seed.endsAt).getTime() <= Date.now());

        logger.info('=== INFORMASI AKUN LENGKAP ===');
        logger.info(`👤 User: ${user.rewardWalletAddress || 'Unknown'}`);
        logger.info(`💰 Saldo: ${user.coins || 0} koin | ${user.ap || 0} AP`);
        logger.info(`✨ XP: ${user.xp || 0} | Level Prestige: ${user.prestigeLevel || 0}`);
        
        // Status slot
        logger.info(`🌱 Slot Aktif: ${activePlots.length}/${plots.length}`);
        logger.info(`📦 Slot Kosong: ${emptyPlots.length}`);
        logger.info(`🔪 Siap Panen: ${readyToHarvest.length}`);
        
        // Inventory
        const seedCount = inventoryCount(state, bot.config.seedKey);
        const boosterCount = bot.config.boosterKey ? inventoryCount(state, bot.config.boosterKey) : 0;
        logger.info(`🌾 Stok ${bot.config.seedKey}: ${seedCount}`);
        if (bot.config.boosterKey) {
            logger.info(`⚡ Stok ${bot.config.boosterKey}: ${boosterCount}`);
        }
        
        // Next harvest time
        if (activePlots.length > 0) {
            const nextHarvest = Math.min(...activePlots.map(p => new Date(p.seed.endsAt).getTime()));
            const timeUntilHarvest = Math.max(0, nextHarvest - Date.now());
            const minutes = Math.floor(timeUntilHarvest / 60000);
            const seconds = Math.floor((timeUntilHarvest % 60000) / 1000);
            logger.info(`⏰ Panen berikutnya dalam: ${minutes}m ${seconds}s`);
        }
        
        logger.info('================================');
        
    } catch (error) {
        logger.warn(`Gagal mendapatkan informasi akun: ${error.message}`);
    }
}

export async function handleBatchCycle(bot, initialState = null) {
    if (!bot.isRunning || bot.isPausedForCaptcha || bot.isPausedForSignature || bot.isBatchCycleRunning) return;

    bot.isBatchCycleRunning = true;
    logger.info('🚀 Memulai siklus batch processing...');

    try {
        const state = initialState || (await api.getState()).state;
        if (!state) throw new Error('Gagal mendapatkan state untuk batch cycle.');

        const now = Date.now();
        const plots = state.plots.filter(p => bot.config.slots.includes(p.slotIndex));

        logger.info(`📊 Status awal: ${plots.filter(p => p.seed).length} slot aktif, ${plots.filter(p => !p.seed).length} slot kosong`);

        // [BATCH ONLY MODE] URUTAN: TANAM → PANEN → BOOSTER
        
        // 1. TANAM SEMUA SLOT KOSONG TERLEBIH DAHULU
        const emptySlots = plots.filter(p => !p.seed);
        if (emptySlots.length > 0) {
            logger.action('plant', `🌱 Menanam di ${emptySlots.length} slot kosong secara massal...`);
            
            // Beli bibit jika diperlukan
            await purchaseItemIfNeeded(bot, 'seed', emptySlots.length);
            
            // Proses tanam dalam batch kecil dengan pengecekan state yang ketat
            const plantResults = await processBatchInChunks(
                bot,
                emptySlots.map(p => ({ slotIndex: p.slotIndex, seedKey: bot.config.seedKey })),
                async (planting) => {
                    try {
                        // Cek ulang state sebelum tanam untuk mencegah race condition
                        const { state: currentState } = await api.getState();
                        const currentPlot = currentState.plots.find(p => p.slotIndex === planting.slotIndex);
                        
                        if (currentPlot && currentPlot.seed) {
                            logger.debug(`Slot ${planting.slotIndex} sudah ditanami, skip...`);
                            return { slotIndex: planting.slotIndex, success: true, skipped: true, reason: 'Already planted' };
                        }
                        
                        const result = await api.plantSeed(planting.slotIndex, planting.seedKey);
                        await sleep(API_SETTINGS.PLANT_DELAY);
                        return { slotIndex: planting.slotIndex, success: result.ok, data: result.data, skipped: false };
                    } catch (error) {
                        return { slotIndex: planting.slotIndex, success: false, error: error.message, skipped: false };
                    }
                },
                3, // Batch size lebih kecil untuk stabilitas
                API_SETTINGS.BATCH_DELAY
            );
            
            const successfulPlants = plantResults.filter(r => r.success && !r.skipped);
            const skippedPlants = plantResults.filter(r => r.skipped);
            const failedPlants = plantResults.filter(r => !r.success && !r.skipped);
            
            if (successfulPlants.length > 0) {
                logger.success(`✅ Berhasil menanam di ${successfulPlants.length} slot.`);
            }
            if (skippedPlants.length > 0) {
                logger.info(`⏭️ ${skippedPlants.length} slot dilewati (sudah ditanami).`);
            }
            if (failedPlants.length > 0) {
                logger.warn(`❌ Gagal menanam di ${failedPlants.length} slot.`);
            }
            
            await sleep(API_SETTINGS.BATCH_DELAY);
        } else {
            logger.info(`🌱 Tidak ada slot kosong untuk ditanami.`);
        }

        // Ambil state terbaru setelah tanam
        await sleep(API_SETTINGS.PAUSE_MS);
        const stateAfterPlanting = (await api.getState()).state;
        const plotsAfterPlanting = stateAfterPlanting.plots.filter(p => bot.config.slots.includes(p.slotIndex));

        // 2. PANEN SEMUA SLOT YANG SIAP SETELAH TANAM
        const readyToHarvest = plotsAfterPlanting.filter(p => p.seed && new Date(p.seed.endsAt).getTime() <= now);
        if (readyToHarvest.length > 0) {
            logger.action('harvest', `🔪 Memanen ${readyToHarvest.length} slot yang sudah jadi...`);
            
            // Proses panen dalam batch kecil
            const harvestResults = await processBatchInChunks(
                bot,
                readyToHarvest.map(p => p.slotIndex),
                async (slotIndex) => {
                    try {
                        // Cek ulang state sebelum panen
                        const { state: currentState } = await api.getState();
                        const currentPlot = currentState.plots.find(p => p.slotIndex === slotIndex);
                        
                        if (!currentPlot || !currentPlot.seed) {
                            logger.debug(`Slot ${slotIndex} tidak ada tanaman, skip...`);
                            return { slotIndex, success: true, skipped: true, reason: 'No plant' };
                        }
                        
                        if (new Date(currentPlot.seed.endsAt).getTime() > now) {
                            logger.debug(`Slot ${slotIndex} belum siap panen, skip...`);
                            return { slotIndex, success: true, skipped: true, reason: 'Not ready' };
                        }
                        
                        const result = await api.harvestSlot(slotIndex);
                        await sleep(API_SETTINGS.HARVEST_DELAY);
                        return { slotIndex, success: result.ok, data: result.data, skipped: false };
                    } catch (error) {
                        return { slotIndex, success: false, error: error.message, skipped: false };
                    }
                },
                3, // Batch size lebih kecil untuk stabilitas
                API_SETTINGS.BATCH_DELAY
            );
            
            const successfulHarvests = harvestResults.filter(r => r.success && !r.skipped);
            const skippedHarvests = harvestResults.filter(r => r.skipped);
            const failedHarvests = harvestResults.filter(r => !r.success && !r.skipped);
            
            if (successfulHarvests.length > 0) {
                logger.success(`✅ Berhasil memanen ${successfulHarvests.length} slot.`);
            }
            if (skippedHarvests.length > 0) {
                logger.info(`⏭️ ${skippedHarvests.length} slot dilewati (tidak siap panen).`);
            }
            if (failedHarvests.length > 0) {
                logger.warn(`❌ Gagal memanen ${failedHarvests.length} slot.`);
            }
            
            await sleep(API_SETTINGS.BATCH_DELAY);
        } else {
            logger.info(`🔪 Tidak ada slot yang siap panen.`);
        }

        // 3. PASANG BOOSTER DI SEMUA SLOT YANG PERLU (OPSIONAL)
        if (bot.config.boosterKey) {
            const needsBooster = plotsAfterPlanting.filter(p =>
                bot.config.slots.includes(p.slotIndex) && p.seed && !p.modifier
            );

            if (needsBooster.length > 0) {
                logger.info(`⚡ Memasang booster di ${needsBooster.length} slot...`);
                await purchaseItemIfNeeded(bot, 'booster', needsBooster.length);
                
                // Proses booster dalam batch kecil
                const boosterResults = await processBatchInChunks(
                    bot,
                    needsBooster.map(p => p.slotIndex),
                    async (slotIndex) => {
                        try {
                            // Cek ulang state sebelum pasang booster
                            const { state: currentState } = await api.getState();
                            const currentPlot = currentState.plots.find(p => p.slotIndex === slotIndex);
                            
                            if (!currentPlot || !currentPlot.seed || currentPlot.modifier) {
                                logger.debug(`Slot ${slotIndex} tidak perlu booster, skip...`);
                                return { slotIndex, success: true, skipped: true, reason: 'No booster needed' };
                            }
                            
                            const result = await api.applyModifier(slotIndex, bot.config.boosterKey);
                            await sleep(API_SETTINGS.BOOSTER_DELAY);
                            return { slotIndex, success: result.ok, data: result.data, skipped: false };
                        } catch (error) {
                            return { slotIndex, success: false, error: error.message, skipped: false };
                        }
                    },
                    3, // Batch size lebih kecil untuk stabilitas
                    API_SETTINGS.BATCH_DELAY
                );
                
                const successfulBoosters = boosterResults.filter(r => r.success && !r.skipped);
                const skippedBoosters = boosterResults.filter(r => r.skipped);
                const failedBoosters = boosterResults.filter(r => !r.success && !r.skipped);
                
                if (successfulBoosters.length > 0) {
                    logger.success(`✅ Berhasil memasang booster di ${successfulBoosters.length} slot.`);
                }
                if (skippedBoosters.length > 0) {
                    logger.info(`⏭️ ${skippedBoosters.length} slot dilewati (tidak perlu booster).`);
                }
                if (failedBoosters.length > 0) {
                    logger.warn(`❌ Gagal memasang booster di ${failedBoosters.length} slot.`);
                }
            } else {
                logger.info(`⚡ Tidak ada slot yang perlu booster.`);
            }
        }

        // [BARU] Tampilkan informasi akun lengkap setelah batch selesai
        logger.info(`📊 Siklus batch selesai! Menampilkan informasi akun...`);
        await displayAccountInfo(bot);

    } catch (error) {
        if (error instanceof CaptchaError) return bot.handleCaptchaRequired();
        if (error instanceof SignatureError) return bot.handleSignatureError();
        logger.error(`❌ Terjadi error pada siklus batch: ${error.message}`);
    } finally {
        bot.isBatchCycleRunning = false;
        logger.info(`🔄 Refresh timers dan siap untuk siklus berikutnya...`);
        bot.refreshAllTimers();
    }
}

// [DISABLED] Individual handlers - gunakan batch processing saja
export async function handleHarvest(bot, slotIndex) {
    // [DISABLED] Individual harvest - gunakan batch processing saja
    logger.debug(`Individual harvest dinonaktifkan untuk slot ${slotIndex}. Gunakan batch processing.`);
    return;
}

export async function handlePlanting(bot, slotIndex) {
    // [DISABLED] Individual planting - gunakan batch processing saja
    logger.debug(`Individual planting dinonaktifkan untuk slot ${slotIndex}. Gunakan batch processing.`);
    return;
}

export async function handleBoosterApplication(bot, slotIndex) {
    // [DISABLED] Individual booster - gunakan batch processing saja
    logger.debug(`Individual booster dinonaktifkan untuk slot ${slotIndex}. Gunakan batch processing.`);
    return;
}
