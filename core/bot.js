// =================================================================
// BOT CORE LOGIC
// Jantung dari bot. Mengelola state, timer, dan siklus aksi.
// =================================================================

import { logger } from '../utils/logger.js';
import { api, CaptchaError, SignatureError } from '../services/api.js';
import { handleBatchCycle, handleHarvest, handleBoosterApplication } from './handlers/actionHandlers.js';
import { handleCaptchaRequired, checkPrestigeUpgrade, handleSignatureError } from './handlers/eventHandlers.js';
import { displayStatus } from './utils/display.js';
import { BATCH_SETTINGS } from '../config.js'; // Impor konfigurasi batch

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class Bot {
    constructor(config) {
        this.config = config;
        this.plantTimers = new Map();
        this.boosterTimers = new Map();
        this.slotStates = new Map();
        this.batchTimer = null; // [DIUBAH] Menggantikan batchCycleInterval
        this.isRunning = false;
        this.isPausedForCaptcha = false;
        this.isPausedForSignature = false;
        this.isBatchCycleRunning = false;
        this.captchaCheckInterval = null;
        this.statusInterval = null;
        this.prestigeCheckInterval = null;
        this.notifiedPrestigeLevel = 0;
        this.isBuyingSeed = false;
        this.isBuyingBooster = false;
        this.userIdentifier = 'Unknown Account';
    }

    async start(initialState = null) {
        this.isRunning = true;
        logger.success('Bot berhasil dimulai. Tekan Ctrl+C untuk berhenti.');

        try {
            const data = initialState || await api.getState();
            if (!data.ok) {
                throw new Error(data.error?.message || "Gagal mendapatkan state awal.");
            }

            this.userIdentifier = data.user?.rewardWalletAddress || 'Unknown Account';
            this.notifiedPrestigeLevel = data.user?.prestigeLevel || 0;

            await this.handleBatchCycle(data.state);

        } catch (error) {
            if (error instanceof CaptchaError) {
                return this.handleCaptchaRequired();
            }
            if (error instanceof SignatureError) {
                return this.handleSignatureError();
            }
            logger.error(`Gagal inisialisasi bot: ${error.message}`);
            return this.stop();
        }

        this.statusInterval = setInterval(() => this.displayStatus(), 1000);
        this.prestigeCheckInterval = setInterval(() => this.checkPrestigeUpgrade(), 300000);
        // Interval batch yang lama dihapus, sekarang diatur secara dinamis
        process.on('SIGINT', () => this.stop());
    }

    stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        logger.warn('Menghentikan bot...');

        this.clearAllTimers();
        clearInterval(this.statusInterval);
        clearInterval(this.captchaCheckInterval);
        clearInterval(this.prestigeCheckInterval);

        logger.success('Bot berhenti dengan aman.');
        process.exit(0);
    }

    clearAllTimers() {
        this.plantTimers.forEach(timer => clearTimeout(timer));
        this.boosterTimers.forEach(timer => clearTimeout(timer));
        clearTimeout(this.batchTimer); // Hapus timer batch utama
        this.plantTimers.clear();
        this.boosterTimers.clear();
    }

    async refreshAllTimers() {
        if (!this.isRunning || this.isPausedForCaptcha || this.isPausedForSignature) return;
        logger.info('Memperbarui semua timer slot...');
        this.clearAllTimers();

        try {
            const { state } = await api.getState();
            if (!state) return;

            const plots = state.plots.filter(p => this.config.slots.includes(p.slotIndex));
            let nextBatchHarvestTime = Infinity;
            let isBatchModeActive = BATCH_SETTINGS.ENABLED_SEEDS.includes(this.config.seedKey);

            if (isBatchModeActive) {
                // [LOGIKA BATCH BARU] Cari waktu panen terdekat untuk bibit batch
                for (const slot of plots) {
                    if (slot.seed && this.config.seedKey === slot.seed.key) {
                        const endsAt = new Date(slot.seed.endsAt).getTime();
                        if (endsAt < nextBatchHarvestTime) {
                            nextBatchHarvestTime = endsAt;
                        }
                    }
                }

                // Atur satu timer utama untuk siklus batch berikutnya
                if (nextBatchHarvestTime !== Infinity) {
                    const duration = nextBatchHarvestTime - Date.now();
                    logger.info(`Mode Batch: Siklus berikutnya diatur dalam ${Math.max(0, Math.round(duration / 1000))} detik.`);
                    // Tambahkan buffer 1 detik untuk memastikan semua slot siap
                    this.batchTimer = setTimeout(() => this.handleBatchCycle(), Math.max(0, duration) + 1000);
                }
            } else {
                // [LOGIKA LAMA] Jika bukan mode batch, atur timer individual
                logger.info('Mode Individual: Mengatur timer untuk setiap slot.');
                for (const slot of plots) {
                    if (slot.seed) {
                        this.setHarvestTimer(slot.slotIndex, new Date(slot.seed.endsAt).getTime());
                    }
                }
            }

            // Selalu atur timer untuk booster secara individual
            for (const slot of plots) {
                if (slot.modifier) {
                    this.setBoosterTimer(slot.slotIndex, new Date(slot.modifier.endsAt).getTime());
                }
            }

        } catch (error) {
            logger.warn(`Gagal memperbarui timer: ${error.message}`);
        }
    }

    setHarvestTimer(slotIndex, endsAt) {
        this.slotStates.set(slotIndex, { ...this.slotStates.get(slotIndex), plantEndsAt: endsAt });
        const duration = endsAt - Date.now();
        if (duration <= 0) {
            this.handleHarvest(slotIndex);
            return;
        }
        if (this.plantTimers.has(slotIndex)) clearTimeout(this.plantTimers.get(slotIndex));
        const timer = setTimeout(() => this.handleHarvest(slotIndex), duration);
        this.plantTimers.set(slotIndex, timer);
    }

    setBoosterTimer(slotIndex, endsAt) {
        this.slotStates.set(slotIndex, { ...this.slotStates.get(slotIndex), boosterEndsAt: endsAt });
        const duration = endsAt - Date.now();
        if (duration <= 0) {
            this.handleBoosterApplication(slotIndex);
            return;
        }
        if (this.boosterTimers.has(slotIndex)) clearTimeout(this.boosterTimers.get(slotIndex));
        const timer = setTimeout(() => this.handleBoosterApplication(slotIndex), duration);
        this.boosterTimers.set(slotIndex, timer);
    }

    handleBatchCycle(initialState = null) {
        handleBatchCycle(this, initialState);
    }

    handleHarvest(slotIndex) {
        handleHarvest(this, slotIndex);
    }

    handleBoosterApplication(slotIndex) {
        handleBoosterApplication(this, slotIndex);
    }

    handleCaptchaRequired() {
        handleCaptchaRequired(this);
    }

    handleSignatureError() {
        handleSignatureError(this);
    }

    checkPrestigeUpgrade() {
        checkPrestigeUpgrade(this);
    }

    displayStatus() {
        displayStatus(this);
    }
}
