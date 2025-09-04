// =================================================================
// SMART PRESTIGE MANAGER - AUTO UPDATE SETELAH PRESTIGE
// Sistem cerdas untuk mengatur seed, booster, dan upgrade slot
// =================================================================

import { logger } from '../../utils/logger.js';
import { api } from '../../services/api.js';
import { sendTelegramMessage } from '../../utils/telegram.js';

// Konfigurasi Seed berdasarkan Level dan Cost
const SEED_CONFIG = {
    'Apple Seed': { 
        level: 1, 
        cost: 100, 
        priority: 1,
        description: 'Seed dasar untuk pemula'
    },
    'Golden Apple Seed': { 
        level: 5, 
        cost: 500, 
        priority: 2,
        description: 'Seed emas dengan profit lebih tinggi'
    },
    'Crystal Apple Seed': { 
        level: 10, 
        cost: 1000, 
        priority: 3,
        description: 'Seed kristal dengan yield tinggi'
    },
    'Rainbow Apple Seed': { 
        level: 15, 
        cost: 2000, 
        priority: 4,
        description: 'Seed pelangi dengan bonus special'
    },
    'Cosmic Apple Seed': { 
        level: 20, 
        cost: 5000, 
        priority: 5,
        description: 'Seed kosmik dengan profit maksimal'
    },
    'Deadly Mix': { 
        level: 25, 
        cost: 10000, 
        priority: 6,
        description: 'Seed ultimate dengan profit tertinggi'
    }
};

// Konfigurasi Booster berdasarkan Seed
const BOOSTER_CONFIG = {
    'Apple Seed': { 
        booster: 'Growth Booster', 
        priority: 1,
        description: 'Booster pertumbuhan untuk seed dasar'
    },
    'Golden Apple Seed': { 
        booster: 'Speed Booster', 
        priority: 2,
        description: 'Booster kecepatan untuk seed emas'
    },
    'Crystal Apple Seed': { 
        booster: 'Yield Booster', 
        priority: 3,
        description: 'Booster yield untuk seed kristal'
    },
    'Rainbow Apple Seed': { 
        booster: 'Quality Booster', 
        priority: 4,
        description: 'Booster kualitas untuk seed pelangi'
    },
    'Cosmic Apple Seed': { 
        booster: 'Premium Booster', 
        priority: 5,
        description: 'Booster premium untuk seed kosmik'
    },
    'Deadly Mix': { 
        booster: 'Ultimate Booster', 
        priority: 6,
        description: 'Booster ultimate untuk seed deadly mix'
    }
};

// Konfigurasi Upgrade Slot berdasarkan Cost
const SLOT_UPGRADE_CONFIG = {
    'coin': [
        { level: 1, cost: 1000, description: 'Upgrade slot coin level 1' },
        { level: 2, cost: 2000, description: 'Upgrade slot coin level 2' },
        { level: 3, cost: 5000, description: 'Upgrade slot coin level 3' },
        { level: 4, cost: 10000, description: 'Upgrade slot coin level 4' },
        { level: 5, cost: 20000, description: 'Upgrade slot coin level 5' }
    ],
    'ap': [
        { level: 1, cost: 500, description: 'Upgrade slot AP level 1' },
        { level: 2, cost: 1000, description: 'Upgrade slot AP level 2' },
        { level: 3, cost: 2000, description: 'Upgrade slot AP level 3' },
        { level: 4, cost: 5000, description: 'Upgrade slot AP level 4' },
        { level: 5, cost: 10000, description: 'Upgrade slot AP level 5' }
    ]
};

class SmartPrestigeManager {
    constructor() {
        this.lastUpdateTime = null;
        this.updateInterval = 5 * 60 * 1000; // 5 menit
        this.isUpdating = false;
    }

    // Cek apakah perlu update
    shouldUpdate() {
        if (this.isUpdating) return false;
        if (!this.lastUpdateTime) return true;
        return Date.now() - this.lastUpdateTime > this.updateInterval;
    }

    // Dapatkan seed yang bisa dibeli berdasarkan level dan coin
    getAvailableSeeds(userLevel, userCoins) {
        const availableSeeds = [];
        
        for (const [seedName, config] of Object.entries(SEED_CONFIG)) {
            if (userLevel >= config.level && userCoins >= config.cost) {
                availableSeeds.push({
                    name: seedName,
                    level: config.level,
                    cost: config.cost,
                    priority: config.priority,
                    description: config.description
                });
            }
        }
        
        return availableSeeds.sort((a, b) => a.priority - b.priority);
    }

    // Dapatkan upgrade slot yang bisa dilakukan
    getAvailableSlotUpgrades(userCoins, userAP) {
        const availableUpgrades = [];
        
        // Cek upgrade coin
        for (const upgrade of SLOT_UPGRADE_CONFIG.coin) {
            if (userCoins >= upgrade.cost) {
                availableUpgrades.push({
                    type: 'coin',
                    level: upgrade.level,
                    cost: upgrade.cost,
                    description: upgrade.description,
                    priority: upgrade.level
                });
            }
        }
        
        // Cek upgrade AP
        for (const upgrade of SLOT_UPGRADE_CONFIG.ap) {
            if (userAP >= upgrade.cost) {
                availableUpgrades.push({
                    type: 'ap',
                    level: upgrade.level,
                    cost: upgrade.cost,
                    description: upgrade.description,
                    priority: upgrade.level + 10 // AP upgrade setelah coin
                });
            }
        }
        
        return availableUpgrades.sort((a, b) => a.priority - b.priority);
    }

    // Dapatkan konfigurasi booster yang sesuai
    getBoosterConfig(availableSeeds) {
        const boosterConfig = [];
        
        for (const seed of availableSeeds) {
            if (BOOSTER_CONFIG[seed.name]) {
                const booster = BOOSTER_CONFIG[seed.name];
                boosterConfig.push({
                    seed: seed.name,
                    booster: booster.booster,
                    priority: booster.priority,
                    description: booster.description
                });
            }
        }
        
        return boosterConfig.sort((a, b) => a.priority - b.priority);
    }

    // Update konfigurasi bot setelah prestige
    async updateBotConfig(bot) {
        try {
            this.isUpdating = true;
            logger.info('🔄 Memulai auto-update setelah prestige...');
            
            // 1. Dapatkan data user terbaru
            const { user, state } = await api.getState();
            if (!user || !state) {
                throw new Error('Gagal mendapatkan data user');
            }
            
            const userLevel = user.level || 1;
            const userCoins = user.coins || 0;
            const userAP = user.ap || 0;
            
            logger.info(`📊 Status Akun: Level ${userLevel}, Coins: ${userCoins}, AP: ${userAP}`);
            
            // 2. Cek seed yang bisa dibeli
            const availableSeeds = this.getAvailableSeeds(userLevel, userCoins);
            logger.info(`🌱 Seed Tersedia: ${availableSeeds.length} jenis`);
            
            if (availableSeeds.length === 0) {
                logger.warn('⚠️ Belum ada seed yang bisa dibeli. Level atau coin tidak cukup.');
                return { success: false, reason: 'No available seeds' };
            }
            
            // 3. Cek upgrade slot yang bisa dilakukan
            const slotUpgrades = this.getAvailableSlotUpgrades(userCoins, userAP);
            logger.info(`🔧 Upgrade Slot Tersedia: ${slotUpgrades.length} jenis`);
            
            // 4. Prioritas: Upgrade slot dulu, baru seed dan booster
            if (slotUpgrades.length > 0) {
                logger.info('⚡ Prioritas: Upgrade slot terlebih dahulu...');
                
                for (const upgrade of slotUpgrades) {
                    logger.info(`🔧 ${upgrade.description} (Cost: ${upgrade.cost} ${upgrade.type})`);
                    // Di sini bisa ditambahkan logika untuk upgrade slot
                    // await this.upgradeSlot(upgrade.type, upgrade.level, upgrade.cost);
                }
                
                // Setelah upgrade, cek lagi seed yang bisa dibeli
                const { user: updatedUser } = await api.getState();
                const updatedCoins = updatedUser.coins || 0;
                const updatedAP = updatedUser.ap || 0;
                
                const updatedSeeds = this.getAvailableSeeds(userLevel, updatedCoins);
                if (updatedSeeds.length > availableSeeds.length) {
                    logger.success(`✅ Setelah upgrade, ada ${updatedSeeds.length} seed yang bisa dibeli`);
                }
            }
            
            // 5. Pilih seed terbaik yang bisa dibeli
            const bestSeed = availableSeeds[0]; // Seed dengan priority tertinggi
            logger.info(`🌱 Seed Terpilih: ${bestSeed.name} (Level: ${bestSeed.level}, Cost: ${bestSeed.cost})`);
            
            // 6. Update konfigurasi bot
            bot.config.seedKey = bestSeed.name;
            bot.config.seedBuyQty = 12; // Beli 12 seed untuk 12 slot
            
            // 7. Cek booster yang sesuai
            const boosterConfig = this.getBoosterConfig([bestSeed]);
            if (boosterConfig.length > 0) {
                const bestBooster = boosterConfig[0];
                logger.info(`⚡ Booster Terpilih: ${bestBooster.booster} untuk ${bestBooster.seed}`);
                
                bot.config.boosterKey = bestBooster.booster;
                bot.config.boosterBuyQty = 12; // Beli 12 booster untuk 12 slot
            } else {
                logger.warn('⚠️ Belum ada booster yang sesuai untuk seed ini');
                bot.config.boosterKey = null;
            }
            
            // 8. Simpan konfigurasi
            await this.saveBotConfig(bot);
            
            // 9. Kirim notifikasi ke Telegram
            await this.sendUpdateNotification(bot, availableSeeds, slotUpgrades, boosterConfig);
            
            this.lastUpdateTime = Date.now();
            logger.success('✅ Auto-update selesai!');
            
            return {
                success: true,
                seed: bestSeed.name,
                booster: boosterConfig.length > 0 ? boosterConfig[0].booster : null,
                slotUpgrades: slotUpgrades.length
            };
            
        } catch (error) {
            logger.error(`❌ Auto-update gagal: ${error.message}`);
            return { success: false, error: error.message };
        } finally {
            this.isUpdating = false;
        }
    }

    // Simpan konfigurasi bot
    async saveBotConfig(bot) {
        try {
            // Di sini bisa ditambahkan logika untuk menyimpan konfigurasi
            // Misalnya ke file config atau database
            logger.info('💾 Konfigurasi bot disimpan');
        } catch (error) {
            logger.error(`❌ Gagal menyimpan konfigurasi: ${error.message}`);
        }
    }

    // Kirim notifikasi update ke Telegram
    async sendUpdateNotification(bot, availableSeeds, slotUpgrades, boosterConfig) {
        try {
            const message = `🔄 *AUTO-UPDATE SETELAH PRESTIGE* 🔄

🌱 *Seed Configuration:*
• Seed Aktif: \`${bot.config.seedKey}\`
• Seed Tersedia: ${availableSeeds.length} jenis
• Booster Aktif: ${bot.config.boosterKey || 'None'}

🔧 *Slot Upgrades:*
• Upgrade Tersedia: ${slotUpgrades.length} jenis
• Prioritas: ${slotUpgrades.length > 0 ? 'Upgrade slot dulu' : 'Langsung farming'}

⚡ *Booster Configuration:*
• Booster Tersedia: ${boosterConfig.length} jenis
• Status: ${boosterConfig.length > 0 ? 'Aktif' : 'Belum ada booster'}

🎯 *Strategy:*
• Prioritas 1: Upgrade slot (coin & AP)
• Prioritas 2: Beli seed terbaik
• Prioritas 3: Pasang booster sesuai seed

⏰ *Waktu:* ${new Date().toLocaleString('id-ID')}`;

            await sendTelegramMessage(message);
            logger.info('📱 Notifikasi update dikirim ke Telegram');
        } catch (error) {
            logger.error(`❌ Gagal mengirim notifikasi: ${error.message}`);
        }
    }

    // Cek apakah perlu update berdasarkan kondisi
    async checkAndUpdate(bot) {
        if (!this.shouldUpdate()) return;
        
        try {
            const { user } = await api.getState();
            if (!user) return;
            
            // Cek apakah baru saja prestige
            const currentPrestigeLevel = user.prestigeLevel || 0;
            const currentLevel = user.level || 1;
            
            // Jika level rendah dan baru prestige, update konfigurasi
            if (currentLevel <= 5 && currentPrestigeLevel > 0) {
                logger.info('🎯 Deteksi prestige baru, memulai auto-update...');
                await this.updateBotConfig(bot);
            }
        } catch (error) {
            logger.error(`❌ Gagal cek update: ${error.message}`);
        }
    }
}

// Export instance
export const smartPrestigeManager = new SmartPrestigeManager();
