// =================================================================
// ACTION HANDLERS - FIXED VERSION
// Logika untuk aksi bot: panen, tanam, booster, dan siklus batch.
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
async function processBatchInChunks(bot, items, processFunction, batchSize = BATCH_SETTINGS.MAX_BATCH_SIZE, delay = API_SETTINGS.BATCH_DELAY) {
    const results = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const chunk = items.slice(i, i + batchSize);
        logger.debug(`Memproses batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)} (${chunk.length} item)`);
        
        const chunkResults = await Promise.all(chunk.map(item => processFunction(item)));
        results.push(...chunkResults);
        
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
    logger.info('Memulai siklus batch...');

    try {
        const state = initialState || (await api.getState()).state;
        if (!state) throw new Error('Gagal mendapatkan state untuk batch cycle.');

        const now = Date.now();
        const plots = state.plots.filter(p => bot.config.slots.includes(p.slotIndex));

        // 1. PANEN SEMUA SLOT YANG SIAP
        const readyToHarvest = plots.filter(p => p.seed && new Date(p.seed.endsAt).getTime() <= now);
        if (readyToHarvest.length > 0) {
            logger.action('harvest', `Memanen ${readyToHarvest.length} slot secara massal...`);
            
            // Proses panen dalam batch kecil untuk menghindari rate limiting
            const harvestResults = await processBatchInChunks(
                bot,
                readyToHarvest.map(p => p.slotIndex),
                async (slotIndex) => {
                    try {
                        const result = await api.harvestSlot(slotIndex);
                        await sleep(API_SETTINGS.HARVEST_DELAY);
                        return { slotIndex, success: result.ok, data: result.data };
                    } catch (error) {
                        return { slotIndex, success: false, error: error.message };
                    }
                },
                BATCH_SETTINGS.MAX_BATCH_SIZE,
                API_SETTINGS.HARVEST_DELAY
            );
            
            const successfulHarvests = harvestResults.filter(r => r.success);
            const failedHarvests = harvestResults.filter(r => !r.success);
            
            if (successfulHarvests.length > 0) {
                logger.success(`Berhasil memanen ${successfulHarvests.length} slot.`);
            }
            if (failedHarvests.length > 0) {
                logger.warn(`Gagal memanen ${failedHarvests.length} slot.`);
            }
            
            await sleep(API_SETTINGS.BATCH_DELAY);
        }

        // Ambil state terbaru setelah panen
        const stateAfterHarvest = (await api.getState()).state;
        const plotsAfterHarvest = stateAfterHarvest.plots.filter(p => bot.config.slots.includes(p.slotIndex));

        // 2. TANAM SEMUA SLOT KOSONG
        const emptySlots = plotsAfterHarvest.filter(p => !p.seed);
        if (emptySlots.length > 0) {
            await purchaseItemIfNeeded(bot, 'seed', emptySlots.length);
            logger.action('plant', `Menanam di ${emptySlots.length} slot secara massal...`);
            
            // Proses tanam dalam batch kecil
            const plantResults = await processBatchInChunks(
                bot,
                emptySlots.map(p => ({ slotIndex: p.slotIndex, seedKey: bot.config.seedKey })),
                async (planting) => {
                    try {
                        const result = await api.plantSeed(planting.slotIndex, planting.seedKey);
                        await sleep(API_SETTINGS.PLANT_DELAY);
                        return { slotIndex: planting.slotIndex, success: result.ok, data: result.data };
                    } catch (error) {
                        return { slotIndex: planting.slotIndex, success: false, error: error.message };
                    }
                },
                BATCH_SETTINGS.MAX_BATCH_SIZE,
                API_SETTINGS.PLANT_DELAY
            );
            
            const successfulPlants = plantResults.filter(r => r.success);
            const failedPlants = plantResults.filter(r => !r.success);
            
            if (successfulPlants.length > 0) {
                logger.success(`Berhasil menanam di ${successfulPlants.length} slot.`);
            }
            if (failedPlants.length > 0) {
                logger.warn(`Gagal menanam di ${failedPlants.length} slot.`);
            }
            
            await sleep(API_SETTINGS.BATCH_DELAY);
        }

        // Ambil state terbaru setelah tanam
        const stateAfterPlanting = (await api.getState()).state;

        // 3. PASANG BOOSTER DI SEMUA SLOT YANG PERLU
        if (bot.config.boosterKey) {
            const needsBooster = stateAfterPlanting.plots.filter(p =>
                bot.config.slots.includes(p.slotIndex) && p.seed && !p.modifier
            );

            if (needsBooster.length > 0) {
                logger.info(`Memasang booster di ${needsBooster.length} slot...`);
                await purchaseItemIfNeeded(bot, 'booster', needsBooster.length);
                
                // Proses booster dalam batch kecil
                const boosterResults = await processBatchInChunks(
                    bot,
                    needsBooster.map(p => p.slotIndex),
                    async (slotIndex) => {
                        try {
                            const result = await api.applyModifier(slotIndex, bot.config.boosterKey);
                            await sleep(API_SETTINGS.BOOSTER_DELAY);
                            return { slotIndex, success: result.ok, data: result.data };
                        } catch (error) {
                            return { slotIndex, success: false, error: error.message };
                        }
                    },
                    BATCH_SETTINGS.MAX_BATCH_SIZE,
                    API_SETTINGS.BOOSTER_DELAY
                );
                
                const successfulBoosters = boosterResults.filter(r => r.success);
                const failedBoosters = boosterResults.filter(r => !r.success);
                
                if (successfulBoosters.length > 0) {
                    logger.success(`Berhasil memasang booster di ${successfulBoosters.length} slot.`);
                }
                if (failedBoosters.length > 0) {
                    logger.warn(`Gagal memasang booster di ${failedBoosters.length} slot.`);
                }
            }
        }

        // [BARU] Tampilkan informasi akun lengkap setelah batch selesai
        await displayAccountInfo(bot);

    } catch (error) {
        if (error instanceof CaptchaError) return bot.handleCaptchaRequired();
        if (error instanceof SignatureError) return bot.handleSignatureError();
        logger.error(`Terjadi error pada siklus batch: ${error.message}`);
    } finally {
        bot.isBatchCycleRunning = false;
        bot.refreshAllTimers();
    }
}

export async function handleHarvest(bot, slotIndex) {
    if (!bot.isRunning || bot.isPausedForCaptcha || bot.isPausedForSignature) return;
    bot.plantTimers.delete(slotIndex);

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            logger.action('harvest', `Memanen slot ${slotIndex}...`);
            const result = await api.harvestSlot(slotIndex);
            if (result.ok) {
                const earnings = result.data.plotResults[0];
                const coins = Math.round(earnings.coinsEarned || 0);
                const ap = Math.round(earnings.apEarned || 0);
                const xp = Math.round(earnings.xpGained || 0);
                logger.success(`Slot ${slotIndex} dipanen: +${coins} koin, +${ap} AP, +${xp} XP.`);

                // ==========================================================
                // >> PERUBAHAN UTAMA <<
                // Jangan panggil handlePlanting di sini.
                // Biarkan refreshAllTimers yang mengatur ulang logika untuk slot ini.
                // Ini mencegah panggilan tanam ganda.
                // ==========================================================
                await sleep(API_SETTINGS.HARVEST_DELAY);
                bot.refreshAllTimers(); // Memanggil refresh untuk re-evaluasi semua slot
                // ==========================================================

                return; // Sukses, keluar dari loop
            }
            throw new Error(result.error?.message || 'Unknown harvest error');
        } catch (error) {
            if (error instanceof CaptchaError) return bot.handleCaptchaRequired();
            if (error instanceof SignatureError) return bot.handleSignatureError();
            logger.error(`Gagal memanen slot ${slotIndex}: ${error.message}. Mencoba lagi... (${attempt}/3)`);
            if (attempt < 3) {
                await sleep(API_SETTINGS.RETRY_DELAY * Math.pow(2, attempt - 1));
            } else {
                logger.error(`Gagal total memanen slot ${slotIndex} setelah 3 percobaan.`);
                bot.refreshAllTimers(); // Refresh bahkan jika gagal total
            }
        }
    }
}

export async function handlePlanting(bot, slotIndex) {
    if (!bot.isRunning || bot.isPausedForCaptcha || bot.isPausedForSignature) return;

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await purchaseItemIfNeeded(bot, 'seed');
            logger.action('plant', `Menanam di slot ${slotIndex}...`);
            const plantResult = await api.plantSeed(slotIndex, bot.config.seedKey);

            if (plantResult.ok) {
                logger.success(`Slot ${slotIndex} ditanami ${bot.config.seedKey}.`);
                if (bot.config.boosterKey) {
                    await sleep(API_SETTINGS.PLANT_DELAY);
                    await handleBoosterApplication(bot, slotIndex);
                }
                bot.refreshAllTimers(); // Panggil refresh setelah berhasil
                return; // Sukses, keluar
            }

            if (plantResult.error?.message?.includes('Not enough')) {
                logger.warn(`Slot ${slotIndex} gagal tanam (race condition). Mencoba lagi...`);
                await sleep(API_SETTINGS.PLANT_DELAY); // Tunggu sebentar sebelum coba lagi
                continue; // Lanjutkan ke attempt berikutnya
            }
            throw new Error(plantResult.error?.message || 'Unknown planting error');
        } catch (error) {
            if (error instanceof CaptchaError) return bot.handleCaptchaRequired();
            if (error instanceof SignatureError) return bot.handleSignatureError();
            logger.error(`Gagal menanam di slot ${slotIndex}: ${error.message}. Mencoba lagi... (${attempt}/3)`);
            if (attempt < 3) {
                await sleep(API_SETTINGS.RETRY_DELAY * Math.pow(2, attempt - 1));
            } else {
                logger.error(`Gagal total menanam di slot ${slotIndex} setelah 3 percobaan.`);
            }
        }
    }
}

// [FIXED] Fungsi ini sekarang lebih tangguh terhadap race condition
export async function handleBoosterApplication(bot, slotIndex) {
    if (!bot.isRunning || !bot.config.boosterKey || bot.isPausedForCaptcha || bot.isPausedForSignature) return;

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await purchaseItemIfNeeded(bot, 'booster');

            // Cek ulang state sebelum memasang, jaga-jaga sudah dipasang proses lain
            const { state } = await api.getState();
            const currentSlot = state.plots.find(p => p.slotIndex === slotIndex);
            if (currentSlot && currentSlot.modifier) {
                logger.debug(`Booster untuk slot ${slotIndex} sudah dipasang oleh proses lain.`);
                bot.refreshAllTimers();
                return;
            }

            logger.action('boost', `Memasang booster di slot ${slotIndex}...`);
            const applyResult = await api.applyModifier(slotIndex, bot.config.boosterKey);

            if (applyResult.ok) {
                logger.success(`Booster ${bot.config.boosterKey} terpasang di slot ${slotIndex}.`);
                bot.refreshAllTimers();
                return; // Sukses, keluar
            }

            // Jika error karena booster habis (race condition), coba lagi dari awal
            if (applyResult.error?.message?.includes('Not enough')) {
                logger.warn(`Slot ${slotIndex} gagal pasang booster (race condition). Mencoba lagi...`);
                await sleep(API_SETTINGS.BOOSTER_DELAY); // Tunggu lebih lama agar pembelian selesai
                continue; // Lanjutkan ke attempt berikutnya
            }

            throw new Error(applyResult.error?.message || 'Unknown booster application error');
        } catch (error) {
            if (error instanceof CaptchaError) return bot.handleCaptchaRequired();
            if (error instanceof SignatureError) return bot.handleSignatureError();
            logger.error(`Error saat memasang booster di slot ${slotIndex}: ${error.message}. Mencoba lagi... (${attempt}/3)`);
            if (attempt < 3) {
                await sleep(API_SETTINGS.RETRY_DELAY * Math.pow(2, attempt - 1));
            } else {
                logger.error(`Gagal total memasang booster di slot ${slotIndex} setelah 3 percobaan.`);
            }
        }
    }
}
