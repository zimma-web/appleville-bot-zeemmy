// =================================================================
// SEED & BOOSTER CONFIGURATION MANAGER
// Konfigurasi manual untuk seed dan booster berdasarkan level
// =================================================================

import { logger } from '../../utils/logger.js';
import { sendTelegramMessage } from '../../utils/telegram.js';

// Konfigurasi Seed berdasarkan Level
export const SEED_LEVEL_CONFIG = {
    1: { seed: 'Apple Seed', cost: 100, description: 'Seed dasar untuk level 1' },
    5: { seed: 'Golden Apple Seed', cost: 500, description: 'Seed emas untuk level 5' },
    10: { seed: 'Crystal Apple Seed', cost: 1000, description: 'Seed kristal untuk level 10' },
    15: { seed: 'Rainbow Apple Seed', cost: 2000, description: 'Seed pelangi untuk level 15' },
    20: { seed: 'Cosmic Apple Seed', cost: 5000, description: 'Seed kosmik untuk level 20' },
    25: { seed: 'Deadly Mix', cost: 10000, description: 'Seed ultimate untuk level 25' }
};

// Konfigurasi Booster berdasarkan Seed
export const BOOSTER_SEED_CONFIG = {
    'Apple Seed': { booster: 'Growth Booster', cost: 50, description: 'Booster pertumbuhan' },
    'Golden Apple Seed': { booster: 'Speed Booster', cost: 100, description: 'Booster kecepatan' },
    'Crystal Apple Seed': { booster: 'Yield Booster', cost: 200, description: 'Booster yield' },
    'Rainbow Apple Seed': { booster: 'Quality Booster', cost: 500, description: 'Booster kualitas' },
    'Cosmic Apple Seed': { booster: 'Premium Booster', cost: 1000, description: 'Booster premium' },
    'Deadly Mix': { booster: 'Ultimate Booster', cost: 2000, description: 'Booster ultimate' }
};

// Konfigurasi Upgrade Slot
export const SLOT_UPGRADE_CONFIG = {
    coin: [
        { level: 1, cost: 1000, description: 'Upgrade slot coin level 1' },
        { level: 2, cost: 2000, description: 'Upgrade slot coin level 2' },
        { level: 3, cost: 5000, description: 'Upgrade slot coin level 3' },
        { level: 4, cost: 10000, description: 'Upgrade slot coin level 4' },
        { level: 5, cost: 20000, description: 'Upgrade slot coin level 5' }
    ],
    ap: [
        { level: 1, cost: 500, description: 'Upgrade slot AP level 1' },
        { level: 2, cost: 1000, description: 'Upgrade slot AP level 2' },
        { level: 3, cost: 2000, description: 'Upgrade slot AP level 3' },
        { level: 4, cost: 5000, description: 'Upgrade slot AP level 4' },
        { level: 5, cost: 10000, description: 'Upgrade slot AP level 5' }
    ]
};

class SeedBoosterConfigManager {
    constructor() {
        this.currentConfig = null;
        this.lastUpdateTime = null;
    }

    // Dapatkan seed yang sesuai berdasarkan level
    getSeedForLevel(level) {
        const levels = Object.keys(SEED_LEVEL_CONFIG).map(Number).sort((a, b) => b - a);
        
        for (const seedLevel of levels) {
            if (level >= seedLevel) {
                return SEED_LEVEL_CONFIG[seedLevel];
            }
        }
        
        // Fallback ke seed terendah
        return SEED_LEVEL_CONFIG[1];
    }

    // Dapatkan booster yang sesuai berdasarkan seed
    getBoosterForSeed(seedName) {
        return BOOSTER_SEED_CONFIG[seedName] || null;
    }

    // Cek apakah seed bisa dibeli
    canAffordSeed(seedName, userCoins) {
        const seedConfig = Object.values(SEED_LEVEL_CONFIG).find(s => s.seed === seedName);
        return seedConfig && userCoins >= seedConfig.cost;
    }

    // Cek apakah booster bisa dibeli
    canAffordBooster(boosterName, userCoins) {
        const boosterConfig = Object.values(BOOSTER_SEED_CONFIG).find(b => b.booster === boosterName);
        return boosterConfig && userCoins >= boosterConfig.cost;
    }

    // Dapatkan upgrade slot yang bisa dilakukan
    getAffordableSlotUpgrades(userCoins, userAP) {
        const affordableUpgrades = [];
        
        // Cek upgrade coin
        for (const upgrade of SLOT_UPGRADE_CONFIG.coin) {
            if (userCoins >= upgrade.cost) {
                affordableUpgrades.push({
                    type: 'coin',
                    ...upgrade,
                    priority: upgrade.level
                });
            }
        }
        
        // Cek upgrade AP
        for (const upgrade of SLOT_UPGRADE_CONFIG.ap) {
            if (userAP >= upgrade.cost) {
                affordableUpgrades.push({
                    type: 'ap',
                    ...upgrade,
                    priority: upgrade.level + 10 // AP upgrade setelah coin
                });
            }
        }
        
        return affordableUpgrades.sort((a, b) => a.priority - b.priority);
    }

    // Update konfigurasi bot berdasarkan level dan resources
    async updateBotConfig(bot, userLevel, userCoins, userAP) {
        try {
            logger.info(`🔧 Updating bot config for level ${userLevel}...`);
            
            // 1. Dapatkan seed yang sesuai
            const seedConfig = this.getSeedForLevel(userLevel);
            logger.info(`🌱 Seed untuk level ${userLevel}: ${seedConfig.seed} (Cost: ${seedConfig.cost})`);
            
            // 2. Cek apakah bisa beli seed
            if (!this.canAffordSeed(seedConfig.seed, userCoins)) {
                logger.warn(`⚠️ Tidak bisa beli ${seedConfig.seed}, coin tidak cukup (${userCoins}/${seedConfig.cost})`);
                return { success: false, reason: 'Insufficient coins for seed' };
            }
            
            // 3. Update konfigurasi seed
            bot.config.seedKey = seedConfig.seed;
            bot.config.seedBuyQty = 12; // Beli 12 seed untuk 12 slot
            
            // 4. Dapatkan booster yang sesuai
            const boosterConfig = this.getBoosterForSeed(seedConfig.seed);
            if (boosterConfig) {
                logger.info(`⚡ Booster untuk ${seedConfig.seed}: ${boosterConfig.booster} (Cost: ${boosterConfig.cost})`);
                
                // 5. Cek apakah bisa beli booster
                if (this.canAffordBooster(boosterConfig.booster, userCoins)) {
                    bot.config.boosterKey = boosterConfig.booster;
                    bot.config.boosterBuyQty = 12; // Beli 12 booster untuk 12 slot
                    logger.success(`✅ Booster ${boosterConfig.booster} diaktifkan`);
                } else {
                    logger.warn(`⚠️ Tidak bisa beli ${boosterConfig.booster}, coin tidak cukup (${userCoins}/${boosterConfig.cost})`);
                    bot.config.boosterKey = null;
                }
            } else {
                logger.warn(`⚠️ Tidak ada booster yang sesuai untuk ${seedConfig.seed}`);
                bot.config.boosterKey = null;
            }
            
            // 6. Cek upgrade slot yang bisa dilakukan
            const slotUpgrades = this.getAffordableSlotUpgrades(userCoins, userAP);
            if (slotUpgrades.length > 0) {
                logger.info(`🔧 Slot upgrades tersedia: ${slotUpgrades.length} jenis`);
                for (const upgrade of slotUpgrades) {
                    logger.info(`  • ${upgrade.description} (${upgrade.cost} ${upgrade.type})`);
                }
            }
            
            // 7. Simpan konfigurasi
            this.currentConfig = {
                seed: seedConfig.seed,
                booster: bot.config.boosterKey,
                slotUpgrades: slotUpgrades.length,
                timestamp: Date.now()
            };
            
            this.lastUpdateTime = Date.now();
            
            // 8. Kirim notifikasi ke Telegram
            await this.sendConfigNotification(bot, seedConfig, boosterConfig, slotUpgrades);
            
            logger.success('✅ Bot config updated successfully!');
            return { success: true, config: this.currentConfig };
            
        } catch (error) {
            logger.error(`❌ Failed to update bot config: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // Kirim notifikasi konfigurasi ke Telegram
    async sendConfigNotification(bot, seedConfig, boosterConfig, slotUpgrades) {
        try {
            const message = `🔧 *BOT CONFIG UPDATED* 🔧

🌱 *Seed Configuration:*
• Seed Aktif: \`${bot.config.seedKey}\`
• Cost: ${seedConfig.cost} coins
• Description: ${seedConfig.description}

⚡ *Booster Configuration:*
• Booster Aktif: ${bot.config.boosterKey || 'None'}
${boosterConfig ? `• Cost: ${boosterConfig.cost} coins` : ''}
${boosterConfig ? `• Description: ${boosterConfig.description}` : ''}

🔧 *Slot Upgrades:*
• Upgrade Tersedia: ${slotUpgrades.length} jenis
${slotUpgrades.length > 0 ? '• Prioritas: Upgrade slot dulu' : '• Status: Langsung farming'}

🎯 *Strategy:*
• Prioritas 1: ${slotUpgrades.length > 0 ? 'Upgrade slot (coin & AP)' : 'Langsung farming'}
• Prioritas 2: Beli seed terbaik
• Prioritas 3: ${bot.config.boosterKey ? 'Pasang booster' : 'Tunggu booster'}

⏰ *Waktu:* ${new Date().toLocaleString('id-ID')}`;

            await sendTelegramMessage(message);
            logger.info('📱 Config notification sent to Telegram');
        } catch (error) {
            logger.error(`❌ Failed to send config notification: ${error.message}`);
        }
    }

    // Dapatkan konfigurasi saat ini
    getCurrentConfig() {
        return this.currentConfig;
    }

    // Reset konfigurasi
    resetConfig() {
        this.currentConfig = null;
        this.lastUpdateTime = null;
        logger.info('🔄 Bot config reset');
    }
}

// Export instance
export const seedBoosterConfigManager = new SeedBoosterConfigManager();
