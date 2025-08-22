// =================================================================
// BOT CORE LOGIC
// Jantung dari bot. Mengelola state, timer, dan siklus aksi.
// =================================================================

import { logger, updateLine } from '../utils/logger.js';
import { api } from '../services/api.js';
import { SEEDS } from '../config.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class Bot {
    constructor(config) {
        this.config = config;
        this.plantTimers = new Map();
        this.boosterTimers = new Map();
        // [BARU] Menyimpan state waktu selesai untuk display
        this.slotStates = new Map();
        this.isRunning = false;
        this.statusInterval = null;
    }

    /**
     * Memulai bot dan siklus utamanya.
     */
    async start() {
        this.isRunning = true;
        logger.success('Bot berhasil dimulai. Tekan Ctrl+C untuk berhenti.');

        const { state } = await api.getState();
        await this.initializeSlots(state);

        // Memulai status display
        this.statusInterval = setInterval(() => this.displayStatus(), 1000); // Update tiap detik

        // Menangani sinyal berhenti (Ctrl+C)
        process.on('SIGINT', () => this.stop());
    }

    /**
     * Menghentikan bot dan membersihkan semua timer.
     */
    stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        logger.warn('Menghentikan bot...');

        // Hapus semua timer yang sedang berjalan untuk mencegah memory leak
        this.plantTimers.forEach(timer => clearTimeout(timer));
        this.boosterTimers.forEach(timer => clearTimeout(timer));
        clearInterval(this.statusInterval);

        logger.success('Bot berhenti dengan aman.');
        process.exit(0);
    }

    /**
     * Inisialisasi semua slot saat bot pertama kali dijalankan.
     */
    async initializeSlots(initialState) {
        const slotMap = new Map(initialState.plots.map(p => [p.slotIndex, p]));

        for (const slotIndex of this.config.slots) {
            const slot = slotMap.get(slotIndex);

            if (slot?.seed) {
                this.setHarvestTimer(slotIndex, new Date(slot.seed.endsAt).getTime());
            } else {
                await this.handlePlanting(slotIndex);
            }

            if (slot?.modifier) {
                this.setBoosterTimer(slotIndex, new Date(slot.modifier.endsAt).getTime());
            } else if (this.config.boosterKey && slot?.seed) {
                // Hanya pasang booster jika sudah ada tanaman dan belum ada booster
                await this.handleBoosterApplication(slotIndex);
            }
        }
    }

    // --- MANAJEMEN TIMER ---

    setHarvestTimer(slotIndex, endsAt) {
        // [DIUBAH] Simpan waktu selesai untuk display
        this.slotStates.set(slotIndex, { ...this.slotStates.get(slotIndex), plantEndsAt: endsAt });

        const duration = endsAt - Date.now();
        if (duration <= 0) {
            this.handleHarvest(slotIndex);
            return;
        }
        if (this.plantTimers.has(slotIndex)) {
            clearTimeout(this.plantTimers.get(slotIndex));
        }
        const timer = setTimeout(() => this.handleHarvest(slotIndex), duration);
        this.plantTimers.set(slotIndex, timer);
    }

    setBoosterTimer(slotIndex, endsAt) {
        // [DIUBAH] Simpan waktu selesai untuk display
        this.slotStates.set(slotIndex, { ...this.slotStates.get(slotIndex), boosterEndsAt: endsAt });

        const duration = endsAt - Date.now();
        if (duration <= 0) {
            this.handleBoosterApplication(slotIndex);
            return;
        }
        if (this.boosterTimers.has(slotIndex)) {
            clearTimeout(this.boosterTimers.get(slotIndex));
        }
        const timer = setTimeout(() => this.handleBoosterApplication(slotIndex), duration);
        this.boosterTimers.set(slotIndex, timer);
    }

    // --- SIKLUS AKSI PER SLOT ---

    async handleHarvest(slotIndex) {
        if (!this.isRunning) return;
        this.plantTimers.delete(slotIndex);
        this.slotStates.delete(slotIndex);
        logger.action('harvest', `Memanen slot ${slotIndex}...`);

        const result = await api.harvestSlot(slotIndex);
        if (result.ok) {
            // [DIPERBAIKI] Log panen sekarang menampilkan AP jika ada.
            const earnings = result.data.plotResults[0];
            const coins = Math.round(earnings.coinsEarned || 0);
            const ap = Math.round(earnings.apEarned || 0);
            const xp = Math.round(earnings.xpGained || 0);

            let logMessage = `Slot ${slotIndex} dipanen: +${coins} koin`;
            if (ap > 0) {
                logMessage += `, +${ap} AP`;
            }
            logMessage += `, +${xp} XP.`;

            logger.success(logMessage);

            await sleep(500);
            await this.handlePlanting(slotIndex);
        } else {
            logger.error(`Gagal memanen slot ${slotIndex}. Mencoba lagi dalam 1 menit.`);
            setTimeout(() => this.handleHarvest(slotIndex), 60000);
        }
    }

    async handlePlanting(slotIndex) {
        if (!this.isRunning) return;
        logger.action('plant', `Menanam di slot ${slotIndex}...`);

        let { state } = await api.getState();
        if (inventoryCount(state, this.config.seedKey) < 1) {
            logger.warn(`Bibit ${this.config.seedKey} habis. Membeli ${this.config.seedBuyQty}...`);
            const buyResult = await api.buyItem(this.config.seedKey, this.config.seedBuyQty);
            if (!buyResult.ok) {
                logger.error(`Gagal membeli bibit. Mencoba lagi dalam 1 menit.`);
                setTimeout(() => this.handlePlanting(slotIndex), 60000);
                return;
            }
            logger.success('Berhasil membeli bibit.');
        }

        const plantResult = await api.plantSeed(slotIndex, this.config.seedKey);
        if (plantResult.ok) {
            const newEndsAt = new Date(plantResult.data.plotResults[0].endsAt).getTime();
            this.setHarvestTimer(slotIndex, newEndsAt);
            logger.success(`Slot ${slotIndex} ditanami ${this.config.seedKey}.`);

        } else {
            logger.error(`Gagal menanam di slot ${slotIndex}. Mencoba lagi dalam 1 menit.`);
            setTimeout(() => this.handlePlanting(slotIndex), 60000);
        }
    }

    async handleBoosterApplication(slotIndex) {
        if (!this.isRunning || !this.config.boosterKey) return;

        const { state } = await api.getState();
        const currentSlot = state.plots.find(p => p.slotIndex === slotIndex);

        if (!currentSlot || !currentSlot.seed) {
            logger.debug(`Slot ${slotIndex} kosong, aplikasi booster dibatalkan.`);
            return;
        }

        if (currentSlot.modifier && new Date(currentSlot.modifier.endsAt).getTime() > Date.now()) {
            logger.debug(`Slot ${slotIndex} sudah memiliki booster aktif. Aplikasi dibatalkan.`);
            this.setBoosterTimer(slotIndex, new Date(currentSlot.modifier.endsAt).getTime());
            return;
        }

        logger.action('boost', `Memasang booster di slot ${slotIndex}...`);

        if (inventoryCount(state, this.config.boosterKey) < 1) {
            logger.warn(`Booster ${this.config.boosterKey} habis. Membeli ${this.config.boosterBuyQty}...`);
            const buyResult = await api.buyItem(this.config.boosterKey, this.config.boosterBuyQty);
            if (!buyResult.ok) {
                logger.error(`Gagal membeli booster. Mencoba lagi dalam 1 menit.`);
                setTimeout(() => this.handleBoosterApplication(slotIndex), 60000);
                return;
            }
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
            logger.error(`Gagal memasang booster di slot ${slotIndex}.`);
        }
    }

    displayStatus() {
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
