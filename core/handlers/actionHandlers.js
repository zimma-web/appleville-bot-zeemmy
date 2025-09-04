// =================================================================
// ACTION HANDLERS - ULTRA RESPONSIVE BATCH MODE
// Logika untuk aksi bot: BATCH PROCESSING 100% RESPONSIF - SLOT TIDAK BOLEH TURUN
// =================================================================

import { logger } from '../../utils/logger.js';
import { api, CaptchaError, SignatureError } from '../../services/api.js';
import { BATCH_SETTINGS, API_SETTINGS } from '../../config.js';
import { sendTelegramMessage } from '../../utils/telegram.js';
import { profitTracker } from '../../utils/profit-tracker.js';
import { performanceMetrics } from '../../utils/performance-metrics.js';
import { smartAlerts } from '../../utils/smart-alerts.js';
import { autoPrestige } from '../../utils/auto-prestige.js';
import { dailyReport } from '../../utils/daily-report.js';
import { autoBackup } from '../../utils/auto-backup.js';
import { lowBalanceAlert } from '../../utils/low-balance-alert.js';
import { aiOptimization } from '../../utils/ai-optimization.js';
import { smartPrestigeManager } from '../../utils/smart-prestige-manager.js';
import { autoSlotUpgrader } from '../../utils/auto-slot-upgrader.js';

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
    const batchStartTime = Date.now();
    logger.info(`🚀 Batch cycle dimulai... (batchCount: ${batchCount})`);

    try {
        const state = initialState || (await api.getState()).state;
        if (!state) throw new Error('Gagal mendapatkan state untuk batch cycle.');

        const now = Date.now();
        const plots = state.plots.filter(p => bot.config.slots.includes(p.slotIndex));
        const targetSlotCount = bot.config.slots.length; // Target: 12 slot

        logger.info(`📊 ${plots.filter(p => p.seed).length}/${targetSlotCount} aktif`);

        // Initialize profit tracker jika belum ada
        if (batchCount === 1) {
            profitTracker.initializeSession(state.user || {});
        }

        // [FIXED BATCH MODE] URUTAN: PANEN YANG SIAP → TANAM SEMUA KOSONG → BOOSTER
        
        // 1. [CONSISTENT] PANEN SEMUA 12 SLOT SEKALIGUS (cek yang siap, skip yang belum)
        const activePlots = plots.filter(p => p.seed);
        const readyToHarvest = activePlots.filter(p => new Date(p.seed.endsAt).getTime() <= now);
        const notReadyToHarvest = activePlots.filter(p => new Date(p.seed.endsAt).getTime() > now);
        
        // Selalu panen 12 slot sekaligus untuk konsistensi
        let harvestCount = 0;
        if (activePlots.length > 0) {
            logger.action('harvest', `🔪 Memanen 12 slot...`);
            
            const harvestStartTime = Date.now();
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
            
            const harvestDuration = Date.now() - harvestStartTime;
            const successfulHarvests = harvestResults.filter(r => r.success && !r.skipped);
            const skippedHarvests = harvestResults.filter(r => r.skipped);
            harvestCount = successfulHarvests.length;
            
            // Record harvest performance
            performanceMetrics.recordHarvest(harvestDuration, harvestCount, successfulHarvests.length > 0);
            
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
        let plantCount = 0;
        if (emptySlots.length > 0) {
            logger.action('plant', `🌱 Menanam 12 slot...`);
            
            await purchaseItemIfNeeded(bot, 'seed', 12);
            
            const plantStartTime = Date.now();
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
            
            const plantDuration = Date.now() - plantStartTime;
            const successfulPlants = plantResults.filter(r => r.success && !r.skipped);
            const skippedPlants = plantResults.filter(r => r.skipped);
            plantCount = successfulPlants.length;
            
            // Record plant performance
            performanceMetrics.recordPlant(plantDuration, plantCount, successfulPlants.length > 0);
            
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
        let boosterCount = 0;
        if (bot.config.boosterKey) {
            const stateAfterPlant = (await api.getState()).state;
            const plotsAfterPlant = stateAfterPlant.plots.filter(p => bot.config.slots.includes(p.slotIndex));
            const activePlotsForBooster = plotsAfterPlant.filter(p => p.seed && !p.modifier);
            
            if (activePlotsForBooster.length > 0) {
                logger.action('booster', `⚡ Booster 12 slot...`);
                
                await purchaseItemIfNeeded(bot, 'booster', 12);
                
                const boosterStartTime = Date.now();
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
                
                const boosterDuration = Date.now() - boosterStartTime;
                const successfulBoosters = boosterResults.filter(r => r.success && !r.skipped);
                const skippedBoosters = boosterResults.filter(r => r.skipped);
                boosterCount = successfulBoosters.length;
                
                // Record booster performance
                performanceMetrics.recordBooster(boosterDuration, boosterCount, successfulBoosters.length > 0);
                
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

        // 5. [ENHANCED] Update profit tracker dan performance metrics
        const currentState = (await api.getState()).state;
        profitTracker.updateAfterBatch(currentState.user || {}, harvestCount, plantCount, boosterCount);
        
        const batchDuration = Date.now() - batchStartTime;
        performanceMetrics.recordBatchCycle(batchDuration, harvestCount, plantCount, boosterCount, true);

        // 6. [SMART ALERTS] Check alerts
        smartAlerts.checkLowBalance(currentState.user || {});
        smartAlerts.checkMilestones(currentState.user || {}, profitTracker.getSessionProfit());
        smartAlerts.checkPerformance(performanceMetrics.calculateAverages());

        // 7. [LOW BALANCE ALERT] Check balance alerts
        await lowBalanceAlert.checkBalance(currentState.user || {}, bot);

        // 8. [AUTO PRESTIGE] Check and upgrade if possible
        await autoPrestige.checkAndUpgrade(currentState.user || {});

        // 8.5. [SMART PRESTIGE MANAGER] Auto-update seed dan booster setelah prestige
        await smartPrestigeManager.checkAndUpdate(bot);

        // 8.6. [AUTO SLOT UPGRADER] Upgrade slot otomatis jika ada resources
        await autoSlotUpgrader.checkAndUpgrade();

        // 7. [ENHANCED] Tampilkan info akun dengan profit data
        await displayAccountInfo(bot, batchCount);

        // 8. [TELEGRAM] Kirim milestone notifications
        if (batchCount > 0 && batchCount % 15 === 0) { // Every 15 batches
            const profitReport = profitTracker.generateReport();
            const performanceReport = performanceMetrics.generateReport();
            
            const milestoneMessage = `🎯 *MILESTONE ACHIEVED!* 🎯

🏆 *Batch Milestone #${batchCount}*
• Total Profit: ${profitReport.summary.totalCoinProfit.toLocaleString()} coins
• Total AP: ${profitReport.summary.totalAPProfit.toLocaleString()} AP
• Total Harvests: ${profitReport.summary.totalHarvests}
• Session Time: ${profitReport.summary.sessionHours.toFixed(2)}h
• Performance Score: ${performanceMetrics.getPerformanceScore()}/100

🚀 *Bot Status:*
• Success Rate: ${performanceReport.summary.successRate}
• Uptime: ${performanceReport.summary.uptime}
• Operations/Hour: ${performanceReport.summary.operationsPerHour}

⏰ *Waktu:* ${new Date().toLocaleString('id-ID')}`;

            await sendTelegramMessage(milestoneMessage);
        }

        // 8. [FULL CYCLE] VERIFIKASI FINAL - PASTIKAN 12 SLOT AKTIF
        const verificationPlots = currentState.plots.filter(p => bot.config.slots.includes(p.slotIndex));
        const verificationActiveSlots = verificationPlots.filter(p => p.seed);
        
        if (verificationActiveSlots.length === targetSlotCount) {
            logger.success(`🎯 ${verificationActiveSlots.length}/${targetSlotCount} aktif`);
        }

        // 9. [ENHANCED] Log profit summary setiap 3 batch + Kirim ke Telegram
        logger.info(`🔍 Debug: batchCount = ${batchCount}, batchCount % 3 = ${batchCount % 3}`);
        if (batchCount > 0 && batchCount % 3 === 0) {
            const profitReport = profitTracker.generateReport();
            const performanceReport = performanceMetrics.generateReport();
            
            logger.info('=== PROFIT SUMMARY ===');
            logger.info(`💰 Total Profit: ${profitReport.summary.totalCoinProfit} coins, ${profitReport.summary.totalAPProfit} AP`);
            logger.info(`⏰ Session: ${profitReport.summary.sessionHours.toFixed(2)}h | Rate: ${profitReport.summary.coinsPerHour.toFixed(2)} coins/h`);
            logger.info(`🌾 Total Harvests: ${profitReport.summary.totalHarvests} | Efficiency: ${profitReport.summary.efficiency.toFixed(2)}`);
            logger.info('=====================');

            logger.info('=== PERFORMANCE SUMMARY ===');
            logger.info(`📊 Success Rate: ${performanceReport.summary.successRate} | Uptime: ${performanceReport.summary.uptime}`);
            logger.info(`⚡ Harvest Speed: ${performanceReport.performance.harvestSpeed} | Plant Speed: ${performanceReport.performance.plantSpeed}`);
            logger.info(`🎯 Performance Score: ${performanceMetrics.getPerformanceScore()}/100`);
            logger.info('===========================');

            // Kirim ke Telegram
            const telegramMessage = `📊 *BATCH REPORT #${batchCount}* 📊

💰 *PROFIT SUMMARY*
• Total Profit: ${profitReport.summary.totalCoinProfit.toLocaleString()} coins, ${profitReport.summary.totalAPProfit.toLocaleString()} AP
• Session Time: ${profitReport.summary.sessionHours.toFixed(2)}h
• Profit Rate: ${profitReport.summary.coinsPerHour.toFixed(2)} coins/h, ${profitReport.summary.apPerHour.toFixed(2)} AP/h
• Total Harvests: ${profitReport.summary.totalHarvests}
• Efficiency: ${profitReport.summary.efficiency.toFixed(2)}

📊 *PERFORMANCE SUMMARY*
• Success Rate: ${performanceReport.summary.successRate}
• Uptime: ${performanceReport.summary.uptime}
• Operations/Hour: ${performanceReport.summary.operationsPerHour}
• Harvest Speed: ${performanceReport.performance.harvestSpeed}
• Plant Speed: ${performanceReport.performance.plantSpeed}
• Performance Score: ${performanceMetrics.getPerformanceScore()}/100

⏰ *Waktu:* ${new Date().toLocaleString('id-ID')}`;

            logger.info('📱 Mengirim batch report ke Telegram...');
            try {
                await sendTelegramMessage(telegramMessage);
                logger.info('✅ Batch report berhasil dikirim ke Telegram!');
            } catch (error) {
                logger.error(`❌ Gagal mengirim batch report ke Telegram: ${error.message}`);
            }
        }

        // 10. [DAILY REPORT] Check if should send daily report
        if (batchCount > 0 && batchCount % 60 === 0) { // Check every 60 batches
            const now = new Date();
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();
            
            // Check if it's time for daily report (8:00 AM)
            if (currentHour === 8 && currentMinute < 5) {
                await dailyReport.sendDailyReport();
            }
        }

        // 11. [AUTO BACKUP] Check if should backup
        if (autoBackup.shouldBackup()) {
            await autoBackup.createBackup();
        }

        // 12. [AI OPTIMIZATION] Run AI optimization
        if (batchCount > 0 && batchCount % 30 === 0) { // Every 30 batches
            await aiOptimization.runOptimization();
        }

    } catch (error) {
        if (error instanceof CaptchaError) {
            smartAlerts.checkCaptchaTimeout(bot.lastCaptchaTimestamp);
            return bot.handleCaptchaRequired();
        }
        if (error instanceof SignatureError) return bot.handleSignatureError();
        
        // Record error in performance metrics
        const batchDuration = Date.now() - batchStartTime;
        performanceMetrics.recordBatchCycle(batchDuration, 0, 0, 0, false);
        
        logger.error(`❌ Error batch: ${error.message}`);
        
        // Send error notification to Telegram
        const errorMessage = `🚨 *BATCH ERROR ALERT* 🚨

❌ *Error Terjadi!*
• Error: ${error.message}
• Batch Count: ${batchCount}
• Duration: ${batchDuration}ms
• Status: ⚠️ KRITIS

🔄 *Aksi:*
• Bot akan mencoba melanjutkan
• Periksa koneksi internet
• Restart bot jika error berlanjut

⏰ *Waktu:* ${new Date().toLocaleString('id-ID')}`;

        try {
            await sendTelegramMessage(errorMessage);
        } catch (telegramError) {
            logger.warn(`Failed to send error notification: ${telegramError.message}`);
        }
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
