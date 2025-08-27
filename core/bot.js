// =================================================================
// BOT CORE LOGIC (IMPROVED)
// Jantung dari bot dengan logika transisi yang lebih baik.
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
        this.batchTimer = null;
        this.transitionTimer = null; // Timer untuk transisi mode
        this.isRunning = false;
        this.isPausedForCaptcha = false;
        this.isPausedForSignature = false;
        this.isBatchCycleRunning = false;
        this.isInTransitionMode = false; // Flag untuk mode transisi
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
        clearTimeout(this.batchTimer);
        clearTimeout(this.transitionTimer);
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

            // Periksa apakah ada tanaman lama yang sedang tumbuh
            const hasOldCrops = plots.some(p =>
                p.seed &&
                p.seed.key !== this.config.seedKey &&
                new Date(p.seed.endsAt).getTime() > Date.now()
            );

            if (hasOldCrops && isBatchModeActive && !this.isInTransitionMode) {
                logger.warn('Terdeteksi tanaman lama yang masih tumbuh!');
                logger.warn('Menggunakan mode individual sambil menunggu tanaman lama selesai...');

                this.isInTransitionMode = true;

                // HANYA atur timer untuk tanaman lama, tidak untuk yang baru
                for (const slot of plots) {
                    if (slot.seed && slot.seed.key !== this.config.seedKey) {
                        const endsAt = new Date(slot.seed.endsAt).getTime();
                        if (endsAt > Date.now()) {
                            logger.info(`Slot ${slot.slotIndex}: Menunggu ${slot.seed.key} selesai...`);
                            this.setHarvestTimer(slot.slotIndex, endsAt);
                        }
                    }
                }

                // Mulai proses transisi
                const oldCrops = plots.filter(p =>
                    p.seed &&
                    p.seed.key !== this.config.seedKey &&
                    new Date(p.seed.endsAt).getTime() > Date.now()
                );

                if (oldCrops.length > 0) {
                    let latestOldCropTime = Math.max(...oldCrops.map(p => new Date(p.seed.endsAt).getTime()));
                    const delayToTransition = latestOldCropTime - Date.now() + 2000;

                    logger.info(`Transisi ke mode batch akan dimulai dalam ${Math.round(delayToTransition / 1000)} detik.`);
                    this.transitionTimer = setTimeout(() => this.handleTransitionToBatch(), Math.max(1000, delayToTransition));
                }

            } else if (isBatchModeActive && !this.isInTransitionMode) {
                // Mode batch murni - TIDAK ADA TIMER INDIVIDUAL
                logger.info('Mode Batch Aktif');

                // Cari waktu panen terdekat hanya untuk menentukan kapan batch cycle berikutnya
                for (const slot of plots) {
                    if (slot.seed && this.config.seedKey === slot.seed.key) {
                        const endsAt = new Date(slot.seed.endsAt).getTime();
                        if (endsAt < nextBatchHarvestTime) {
                            nextBatchHarvestTime = endsAt;
                        }
                    }
                }

                if (nextBatchHarvestTime !== Infinity) {
                    const duration = nextBatchHarvestTime - Date.now();
                    logger.info(`Mode Batch: Siklus berikutnya dalam ${Math.max(0, Math.round(duration / 1000))} detik.`);
                    this.batchTimer = setTimeout(() => this.handleBatchCycle(), Math.max(0, duration) + 1000);
                } else {
                    // Tidak ada tanaman batch, jalankan sekarang
                    logger.info('Mode Batch: Memulai siklus batch...');
                    setTimeout(() => this.handleBatchCycle(), 1000);
                }
            } else {
                // Mode Individual penuh
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

    /**
     * Fungsi khusus untuk transisi ke batch mode
     */
    async handleTransitionToBatch() {
        if (!this.isRunning || this.isPausedForCaptcha || this.isPausedForSignature) return;

        try {
            logger.info('Memeriksa apakah siap untuk beralih ke mode batch...');
            const { state } = await api.getState();
            if (!state) return;

            const plots = state.plots.filter(p => this.config.slots.includes(p.slotIndex));

            // Periksa apakah masih ada tanaman lama
            const hasOldCrops = plots.some(p =>
                p.seed &&
                p.seed.key !== this.config.seedKey &&
                new Date(p.seed.endsAt).getTime() > Date.now()
            );

            if (hasOldCrops) {
                // Masih ada tanaman lama, tunggu lagi
                logger.warn('Masih ada tanaman lama yang belum siap dipanen. Menunggu...');
                const oldCrops = plots.filter(p =>
                    p.seed &&
                    p.seed.key !== this.config.seedKey &&
                    new Date(p.seed.endsAt).getTime() > Date.now()
                );

                let nextCheckTime = Math.min(...oldCrops.map(p => new Date(p.seed.endsAt).getTime()));
                const delay = nextCheckTime - Date.now() + 1000;

                this.transitionTimer = setTimeout(() => this.handleTransitionToBatch(), Math.max(1000, delay));
                return;
            }

            // Semua tanaman lama sudah selesai, beralih ke mode batch
            logger.success('Semua tanaman lama telah dipanen. Memulai mode batch!');
            this.isInTransitionMode = false;

            // Clear semua timer individual dan refresh untuk mode batch
            this.clearAllTimers();

            // Langsung jalankan batch cycle
            setTimeout(() => this.handleBatchCycle(), 500);

        } catch (error) {
            logger.error(`Error dalam transisi ke batch: ${error.message}`);
            this.transitionTimer = setTimeout(() => this.handleTransitionToBatch(), 5000);
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