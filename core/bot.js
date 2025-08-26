// =================================================================
// BOT CORE LOGIC
// Jantung dari bot. Mengelola state, timer, dan siklus aksi.
// =================================================================

import { logger } from '../utils/logger.js';
import { api, CaptchaError, SignatureError } from '../services/api.js';
import { handleHarvest, handlePlanting, handleBoosterApplication } from './handlers/actionHandlers.js';
import { handleCaptchaRequired, checkPrestigeUpgrade, handleSignatureError } from './handlers/eventHandlers.js';
import { displayStatus } from './utils/display.js';

export class Bot {
    constructor(config) {
        this.config = config;
        this.plantTimers = new Map();
        this.boosterTimers = new Map();
        this.slotStates = new Map();
        this.isRunning = false;
        this.isPausedForCaptcha = false;
        this.isPausedForSignature = false; // State untuk jeda karena signature error
        this.captchaCheckInterval = null;
        this.statusInterval = null;
        this.prestigeCheckInterval = null;
        this.notifiedPrestigeLevel = 0;
        this.isBuyingSeed = false;
        this.isBuyingBooster = false;
        this.userIdentifier = 'Unknown Account';
    }

    async start() {
        this.isRunning = true;
        logger.success('Bot berhasil dimulai. Tekan Ctrl+C untuk berhenti.');

        try {
            const { user, state } = await api.getState();
            this.userIdentifier = user?.rewardWalletAddress || 'Unknown Account';
            this.notifiedPrestigeLevel = user?.prestigeLevel || 0;
            await this.initializeSlots(state);
        } catch (error) {
            if (error instanceof CaptchaError) {
                await this.handleCaptchaRequired();
            } else if (error instanceof SignatureError) {
                await this.handleSignatureError();
            } else {
                logger.error(`Gagal inisialisasi bot: ${error.message}`);
                return this.stop();
            }
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
        this.plantTimers.clear();
        this.boosterTimers.clear();
    }

    async initializeSlots(initialState) {
        logger.info('Inisialisasi slot...');
        this.clearAllTimers();

        const slotMap = new Map(initialState.plots.map(p => [p.slotIndex, p]));

        for (const slotIndex of this.config.slots) {
            if (!this.isRunning) break;
            const slot = slotMap.get(slotIndex);

            if (slot?.seed) {
                this.setHarvestTimer(slotIndex, new Date(slot.seed.endsAt).getTime());
            } else {
                await this.handlePlanting(slotIndex);
            }

            if (slot?.modifier) {
                this.setBoosterTimer(slotIndex, new Date(slot.modifier.endsAt).getTime());
            } else if (this.config.boosterKey && slot?.seed) {
                await this.handleBoosterApplication(slotIndex);
            }
        }
    }

    // --- MANAJEMEN TIMER ---

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

    // --- MEMANGGIL HANDLER EKSTERNAL ---

    handleCaptchaRequired() {
        handleCaptchaRequired(this);
    }

    handleSignatureError() {
        handleSignatureError(this);
    }

    checkPrestigeUpgrade() {
        checkPrestigeUpgrade(this);
    }

    handleHarvest(slotIndex) {
        handleHarvest(this, slotIndex);
    }

    handlePlanting(slotIndex) {
        handlePlanting(this, slotIndex);
    }

    handleBoosterApplication(slotIndex) {
        handleBoosterApplication(this, slotIndex);
    }

    displayStatus() {
        displayStatus(this);
    }
}
