// =================================================================
// BOT CORE LOGIC - BATCH ONLY MODE
// Jantung dari bot dengan logika batch processing saja, tidak ada individual mode
// =================================================================

import { logger } from '../utils/logger.js';
import { api, CaptchaError, SignatureError } from '../services/api.js';
import { handleBatchCycle } from './handlers/actionHandlers.js';
import { handleCaptchaRequired, checkPrestigeUpgrade, handleSignatureError } from './handlers/eventHandlers.js';
import { displayStatus } from './utils/display.js';
import { BATCH_SETTINGS } from '../config.js';

export class Bot {
    constructor(config) {
        this.config = config;
        this.batchTimer = null;
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
        this.lastCaptchaTimestamp = null;
        this.batchCycleCount = 0; // Counter untuk batch cycle
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

            await this.refreshAllTimers(data.state);

        } catch (error) {
            if (error instanceof CaptchaError) return this.handleCaptchaRequired();
            if (error instanceof SignatureError) return this.handleSignatureError();
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
        clearTimeout(this.batchTimer);
    }

    async refreshAllTimers(initialState = null) {
        if (!this.isRunning || this.isPausedForCaptcha || this.isPausedForSignature) return;
        logger.info('🔄 Memperbarui timer batch...');
        this.clearAllTimers();

        try {
            const state = initialState || (await api.getState()).state;
            if (!state) return;

            const plots = state.plots.filter(p => this.config.slots.includes(p.slotIndex));
            
            // [BATCH ONLY MODE] Selalu gunakan batch processing
            this.runBatchMode(plots);

        } catch (error) {
            logger.warn(`Gagal memperbarui timer: ${error.message}`);
        }
    }

    runBatchMode(plots) {
        logger.info('🚀 Batch mode...');
        let nextBatchHarvestTime = Infinity;
        let allSlotsEmpty = true;

        for (const slot of plots) {
            if (slot.seed) {
                allSlotsEmpty = false;
                const endsAt = new Date(slot.seed.endsAt).getTime();
                if (endsAt < nextBatchHarvestTime) {
                    nextBatchHarvestTime = endsAt;
                }
            }
        }

        if (allSlotsEmpty) {
            // Jika semua slot kosong, langsung jalankan batch cycle
            logger.info('🌱 Slot kosong, batch...');
            this.handleBatchCycle();
        } else {
            const duration = nextBatchHarvestTime - Date.now();
            const delay = Math.max(0, duration) + 500;
            logger.info(`⏰ ${Math.round(delay / 1000)}s`);
            this.batchTimer = setTimeout(() => this.handleBatchCycle(), delay);
        }
    }

    // --- Pemanggil Handler ---
    async handleBatchCycle() {
        if (this.isBatchCycleRunning) {
            logger.debug('Batch cycle sudah berjalan, skip...');
            return;
        }
        this.batchCycleCount++; // Increment counter
        await handleBatchCycle(this, null, this.batchCycleCount);
    }

    // --- Event Handlers ---
    handleCaptchaRequired() {
        if (this.isPausedForCaptcha) return;
        this.isPausedForCaptcha = true;
        this.lastCaptchaTimestamp = Date.now();
        logger.warn('⚠️ CAPTCHA diperlukan! Bot di-pause. Selesaikan CAPTCHA di browser.');
        handleCaptchaRequired(this);
    }

    handleSignatureError() {
        if (this.isPausedForSignature) return;
        this.isPausedForSignature = true;
        logger.error('❌ Error signature! Bot di-pause. Periksa signature di config.');
        handleSignatureError(this);
    }

    // --- Utility Methods ---
    displayStatus() {
        if (!this.isRunning || this.isPausedForCaptcha || this.isPausedForSignature) return;
        displayStatus(this);
    }

    async checkPrestigeUpgrade() {
        if (!this.isRunning || this.isPausedForCaptcha || this.isPausedForSignature) return;
        await checkPrestigeUpgrade(this);
    }

    // --- Captcha & Signature Recovery ---
    async resumeFromCaptcha() {
        if (!this.isPausedForCaptcha) return;
        
        try {
            const data = await api.getState();
            if (data.ok) {
                this.isPausedForCaptcha = false;
                this.lastCaptchaTimestamp = null;
                logger.success('✅ CAPTCHA selesai! Bot dilanjutkan.');
                await this.refreshAllTimers(data.state);
            }
        } catch (error) {
            logger.warn(`Gagal resume dari CAPTCHA: ${error.message}`);
        }
    }

    async resumeFromSignatureError() {
        if (!this.isPausedForSignature) return;
        
        try {
            const data = await api.getState();
            if (data.ok) {
                this.isPausedForSignature = false;
                logger.success('✅ Signature error teratasi! Bot dilanjutkan.');
                await this.refreshAllTimers(data.state);
            }
        } catch (error) {
            logger.warn(`Gagal resume dari signature error: ${error.message}`);
        }
    }
}
