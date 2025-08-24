// =================================================================
// BOT CORE LOGIC
// Jantung dari bot. Mengelola state, timer, dan siklus aksi.
// =================================================================

import { logger, updateLine } from '../utils/logger.js';
import { api, CaptchaError } from '../services/api.js';
import { sendTelegramMessage } from '../utils/telegram.js';

// Impor dari file terpisah dan tangani jika file tidak ada.
let TELEGRAM_SETTINGS = { ENABLED: false, CAPTCHA_RETRY_INTERVAL: 120000 };
try {
    const config = await import('../telegram-config.js');
    TELEGRAM_SETTINGS = config.TELEGRAM_SETTINGS;
} catch (error) {
    // Tidak perlu log di sini karena sudah dihandle di telegram.js
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class Bot {
    constructor(config) {
        this.config = config;
        this.plantTimers = new Map();
        this.boosterTimers = new Map();
        this.slotStates = new Map();
        this.isRunning = false;
        this.isPausedForCaptcha = false;
        this.captchaCheckInterval = null;
        this.statusInterval = null;
        this.isBuyingSeed = false;
        this.isBuyingBooster = false;
        this.userIdentifier = 'Unknown Account';
    }

    /**
     * Memulai bot dan siklus utamanya.
     */
    async start() {
        this.isRunning = true;
        logger.success('Bot berhasil dimulai. Tekan Ctrl+C untuk berhenti.');

        try {
            const { user, state } = await api.getState();
            this.userIdentifier = user?.rewardWalletAddress || 'Unknown Account';
            await this.initializeSlots(state);
        } catch (error) {
            if (error instanceof CaptchaError) {
                await this.handleCaptchaRequired();
            } else {
                logger.error(`Gagal inisialisasi bot: ${error.message}`);
                return this.stop();
            }
        }

        this.statusInterval = setInterval(() => this.displayStatus(), 1000);
        process.on('SIGINT', () => this.stop());
    }

    /**
     * Menghentikan bot dan membersihkan semua timer.
     */
    stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        logger.warn('Menghentikan bot...');

        this.plantTimers.forEach(timer => clearTimeout(timer));
        this.boosterTimers.forEach(timer => clearTimeout(timer));
        clearInterval(this.statusInterval);
        clearInterval(this.captchaCheckInterval);

        logger.success('Bot berhenti dengan aman.');
        process.exit(0);
    }

    /**
     * Inisialisasi semua slot saat bot pertama kali dijalankan.
     */
    async initializeSlots(initialState) {
        logger.info('Inisialisasi slot...');
        this.plantTimers.forEach(timer => clearTimeout(timer));
        this.boosterTimers.forEach(timer => clearTimeout(timer));
        this.plantTimers.clear();
        this.boosterTimers.clear();

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

    // --- PENANGANAN CAPTCHA ---

    async handleCaptchaRequired() {
        if (this.isPausedForCaptcha) return;
        this.isPausedForCaptcha = true;

        logger.error('CAPTCHA DIBUTUHKAN. Bot dijeda.');
        logger.info('Silakan selesaikan CAPTCHA di browser. Bot akan mencoba lagi secara otomatis.');

        const message = `🚨 *CAPTCHA Dibutuhkan!* 🚨\n\nAkun: \`${this.userIdentifier}\`\n\nBot AppleVille dijeda. Mohon selesaikan CAPTCHA di browser.`;
        await sendTelegramMessage(message);

        this.plantTimers.forEach(timer => clearTimeout(timer));
        this.boosterTimers.forEach(timer => clearTimeout(timer));

        this.captchaCheckInterval = setInterval(
            () => this.checkForCaptchaResolution(),
            TELEGRAM_SETTINGS.CAPTCHA_RETRY_INTERVAL
        );
    }

    async checkForCaptchaResolution() {
        logger.info('Mencoba memeriksa status CAPTCHA...');
        try {
            await api.getState();
            logger.success('CAPTCHA sepertinya sudah diselesaikan!');

            const message = `✅ *CAPTCHA Selesai!* ✅\n\nAkun: \`${this.userIdentifier}\`\n\nBot AppleVille akan melanjutkan operasi.`;
            await sendTelegramMessage(message);

            clearInterval(this.captchaCheckInterval);
            this.isPausedForCaptcha = false;
            const { state } = await api.getState();
            await this.initializeSlots(state);
        } catch (error) {
            if (error instanceof CaptchaError) {
                logger.warn('CAPTCHA masih aktif. Mencoba lagi nanti...');
            } else {
                logger.error(`Terjadi error saat memeriksa CAPTCHA: ${error.message}`);
            }
        }
    }

    // --- SIKLUS AKSI PER SLOT ---

    async handleHarvest(slotIndex, retryCount = 0) {
        if (!this.isRunning || this.isPausedForCaptcha) return;
        this.plantTimers.delete(slotIndex);
        this.slotStates.delete(slotIndex);

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
                await this.handlePlanting(slotIndex);
            } else {
                throw new Error(result.error?.message || 'Unknown harvest error');
            }
        } catch (error) {
            if (error instanceof CaptchaError) return this.handleCaptchaRequired();
            if (retryCount < 3) {
                const nextAttempt = retryCount + 1;
                logger.error(`Gagal memanen slot ${slotIndex}. Mencoba lagi... (${nextAttempt}/3)`);
                setTimeout(() => this.handleHarvest(slotIndex, nextAttempt), 5000);
            } else {
                logger.error(`Gagal total memanen slot ${slotIndex} setelah 3 percobaan.`);
            }
        }
    }

    async handlePlanting(slotIndex, retryCount = 0) {
        if (!this.isRunning || this.isPausedForCaptcha) return;
        if (this.isBuyingSeed) {
            setTimeout(() => this.handlePlanting(slotIndex), 2500);
            return;
        }
        try {
            logger.action('plant', `Menanam di slot ${slotIndex}...`);
            let { state } = await api.getState();
            if (inventoryCount(state, this.config.seedKey) < 1) {
                this.isBuyingSeed = true;
                logger.warn(`Bibit ${this.config.seedKey} habis. Membeli ${this.config.seedBuyQty}...`);
                const buyResult = await api.buyItem(this.config.seedKey, this.config.seedBuyQty);
                this.isBuyingSeed = false;
                if (!buyResult.ok) throw new Error('Gagal membeli bibit.');
                logger.success('Berhasil membeli bibit.');
            }
            const plantResult = await api.plantSeed(slotIndex, this.config.seedKey);
            if (plantResult.ok) {
                const newEndsAt = new Date(plantResult.data.plotResults[0].endsAt).getTime();
                this.setHarvestTimer(slotIndex, newEndsAt);
                logger.success(`Slot ${slotIndex} ditanami ${this.config.seedKey}.`);

                // [DIPERBAIKI] Setelah berhasil menanam, selalu cek kebutuhan booster.
                if (this.config.boosterKey) {
                    await sleep(500); // Jeda singkat untuk konsistensi state
                    await this.handleBoosterApplication(slotIndex);
                }
            } else {
                throw new Error(plantResult.error?.message || 'Unknown planting error');
            }
        } catch (error) {
            if (error instanceof CaptchaError) return this.handleCaptchaRequired();
            if (this.isBuyingSeed) this.isBuyingSeed = false;
            if (retryCount < 3) {
                const nextAttempt = retryCount + 1;
                logger.error(`Gagal menanam di slot ${slotIndex}: ${error.message}. Mencoba lagi... (${nextAttempt}/3)`);
                setTimeout(() => this.handlePlanting(slotIndex, nextAttempt), 5000);
            } else {
                logger.error(`Gagal total menanam di slot ${slotIndex} setelah 3 percobaan.`);
            }
        }
    }

    async handleBoosterApplication(slotIndex, retryCount = 0) {
        if (!this.isRunning || !this.config.boosterKey || this.isPausedForCaptcha) return;
        if (this.isBuyingBooster) {
            setTimeout(() => this.handleBoosterApplication(slotIndex), 2500);
            return;
        }
        try {
            const { state } = await api.getState();
            const currentSlot = state.plots.find(p => p.slotIndex === slotIndex);
            if (!currentSlot || !currentSlot.seed) return;
            if (currentSlot.modifier && new Date(currentSlot.modifier.endsAt).getTime() > Date.now()) {
                this.setBoosterTimer(slotIndex, new Date(currentSlot.modifier.endsAt).getTime());
                return;
            }
            logger.action('boost', `Memasang booster di slot ${slotIndex}...`);
            if (inventoryCount(state, this.config.boosterKey) < 1) {
                this.isBuyingBooster = true;
                logger.warn(`Booster ${this.config.boosterKey} habis. Membeli ${this.config.boosterBuyQty}...`);
                const buyResult = await api.buyItem(this.config.boosterKey, this.config.boosterBuyQty);
                this.isBuyingBooster = false;
                if (!buyResult.ok) throw new Error('Gagal membeli booster.');
                logger.success('Berhasil membeli booster.');
            }
            const applyResult = await api.applyModifier(slotIndex, this.config.boosterKey);
            if (applyResult.ok) {
                logger.success(`Booster ${this.config.boosterKey} terpasang di slot ${slotIndex}.`);
                const { state: newState } = await api.getState();
                const updatedSlot = newState.plots.find(p => p.slotIndex === slotIndex);
                if (updatedSlot?.seed) {
                    this.setHarvestTimer(slotIndex, new Date(updatedSlot.seed.endsAt).getTime());
                    logger.info(`Timer panen untuk slot ${slotIndex} disesuaikan.`);
                }
                if (updatedSlot?.modifier) {
                    this.setBoosterTimer(slotIndex, new Date(updatedSlot.modifier.endsAt).getTime());
                }
            } else {
                throw new Error(applyResult.error?.message || 'Unknown booster application error');
            }
        } catch (error) {
            if (error instanceof CaptchaError) return this.handleCaptchaRequired();
            if (this.isBuyingBooster) this.isBuyingBooster = false;
            if (retryCount < 3) {
                const nextAttempt = retryCount + 1;
                logger.error(`Gagal memasang booster di slot ${slotIndex}: ${error.message}. Mencoba lagi... (${nextAttempt}/3)`);
                setTimeout(() => this.handleBoosterApplication(slotIndex, nextAttempt), 5000);
            } else {
                logger.error(`Gagal total memasang booster di slot ${slotIndex} setelah 3 percobaan.`);
            }
        }
    }

    displayStatus() {
        if (this.isPausedForCaptcha) {
            updateLine(`⏸️ Bot dijeda untuk akun ${this.userIdentifier}. Menunggu CAPTCHA diselesaikan...`);
            return;
        }
        const now = Date.now();
        let nextHarvestSlot = null;
        let minDuration = Infinity;
        this.slotStates.forEach((state, slotIndex) => {
            if (state.plantEndsAt) {
                const duration = state.plantEndsAt - now;
                if (duration < minDuration) {
                    minDuration = duration;
                    nextHarvestSlot = slotIndex;
                }
            }
        });
        const farmingCount = this.plantTimers.size;
        let statusMessage = `🌱 Farming ${farmingCount} slots.`;
        if (nextHarvestSlot) {
            const secondsLeft = Math.max(0, Math.floor(minDuration / 1000));
            const hours = Math.floor(secondsLeft / 3600);
            const minutes = Math.floor((secondsLeft % 3600) / 60);
            const seconds = secondsLeft % 60;
            let timeString = '';
            if (hours > 0) timeString += `${hours}h `;
            timeString += `${minutes}m ${seconds}s`;
            statusMessage += ` | Next: slot ${nextHarvestSlot} (${timeString.trim()})`;
        }
        updateLine(statusMessage);
    }
}

function inventoryCount(state, key) {
    const item = (state?.items || []).find(i => i.key === key);
    return item?.quantity || 0;
}
