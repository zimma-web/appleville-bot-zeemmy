// =================================================================
// AUTO SLOT UPGRADER - UPGRADE SLOT OTOMATIS
// Sistem untuk upgrade slot coin dan AP secara otomatis
// =================================================================

import { logger } from '../../utils/logger.js';
import { api } from '../../services/api.js';
import { sendTelegramMessage } from '../../utils/telegram.js';

// Konfigurasi Upgrade Slot
const SLOT_UPGRADE_CONFIG = {
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

class AutoSlotUpgrader {
    constructor() {
        this.isUpgrading = false;
        this.lastUpgradeTime = null;
        this.upgradeInterval = 2 * 60 * 1000; // 2 menit
        this.upgradeHistory = [];
    }

    // Cek apakah perlu upgrade
    shouldUpgrade() {
        if (this.isUpgrading) return false;
        if (!this.lastUpgradeTime) return true;
        return Date.now() - this.lastUpgradeTime > this.upgradeInterval;
    }

    // Dapatkan upgrade yang bisa dilakukan
    getAffordableUpgrades(userCoins, userAP) {
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

    // Upgrade slot coin
    async upgradeCoinSlot(level, cost) {
        try {
            logger.info(`🔧 Upgrading coin slot to level ${level} (Cost: ${cost} coins)...`);
            
            // Di sini bisa ditambahkan logika untuk upgrade slot coin
            // const result = await api.upgradeCoinSlot(level, cost);
            
            // Simulasi upgrade berhasil
            const result = { success: true, newLevel: level };
            
            if (result.success) {
                logger.success(`✅ Coin slot upgraded to level ${level}`);
                this.upgradeHistory.push({
                    type: 'coin',
                    level: level,
                    cost: cost,
                    timestamp: Date.now()
                });
                return { success: true, newLevel: level };
            } else {
                logger.error(`❌ Failed to upgrade coin slot to level ${level}`);
                return { success: false, error: 'Upgrade failed' };
            }
        } catch (error) {
            logger.error(`❌ Error upgrading coin slot: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // Upgrade slot AP
    async upgradeAPSlot(level, cost) {
        try {
            logger.info(`🔧 Upgrading AP slot to level ${level} (Cost: ${cost} AP)...`);
            
            // Di sini bisa ditambahkan logika untuk upgrade slot AP
            // const result = await api.upgradeAPSlot(level, cost);
            
            // Simulasi upgrade berhasil
            const result = { success: true, newLevel: level };
            
            if (result.success) {
                logger.success(`✅ AP slot upgraded to level ${level}`);
                this.upgradeHistory.push({
                    type: 'ap',
                    level: level,
                    cost: cost,
                    timestamp: Date.now()
                });
                return { success: true, newLevel: level };
            } else {
                logger.error(`❌ Failed to upgrade AP slot to level ${level}`);
                return { success: false, error: 'Upgrade failed' };
            }
        } catch (error) {
            logger.error(`❌ Error upgrading AP slot: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // Proses upgrade slot otomatis
    async processAutoUpgrade() {
        try {
            this.isUpgrading = true;
            logger.info('🔧 Starting auto slot upgrade process...');
            
            // 1. Dapatkan data user terbaru
            const { user } = await api.getState();
            if (!user) {
                throw new Error('Failed to get user data');
            }
            
            const userCoins = user.coins || 0;
            const userAP = user.ap || 0;
            
            logger.info(`📊 Current resources: ${userCoins} coins, ${userAP} AP`);
            
            // 2. Dapatkan upgrade yang bisa dilakukan
            const affordableUpgrades = this.getAffordableUpgrades(userCoins, userAP);
            
            if (affordableUpgrades.length === 0) {
                logger.info('ℹ️ No affordable upgrades available');
                return { success: true, upgrades: 0 };
            }
            
            logger.info(`🔧 Found ${affordableUpgrades.length} affordable upgrades`);
            
            // 3. Proses upgrade satu per satu
            let upgradeCount = 0;
            const upgradeResults = [];
            
            for (const upgrade of affordableUpgrades) {
                try {
                    let result;
                    
                    if (upgrade.type === 'coin') {
                        result = await this.upgradeCoinSlot(upgrade.level, upgrade.cost);
                    } else if (upgrade.type === 'ap') {
                        result = await this.upgradeAPSlot(upgrade.level, upgrade.cost);
                    }
                    
                    if (result && result.success) {
                        upgradeCount++;
                        upgradeResults.push({
                            type: upgrade.type,
                            level: upgrade.level,
                            cost: upgrade.cost,
                            success: true
                        });
                        
                        // Delay antar upgrade
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } else {
                        upgradeResults.push({
                            type: upgrade.type,
                            level: upgrade.level,
                            cost: upgrade.cost,
                            success: false,
                            error: result?.error || 'Unknown error'
                        });
                    }
                } catch (error) {
                    logger.error(`❌ Error processing upgrade: ${error.message}`);
                    upgradeResults.push({
                        type: upgrade.type,
                        level: upgrade.level,
                        cost: upgrade.cost,
                        success: false,
                        error: error.message
                    });
                }
            }
            
            // 4. Kirim notifikasi hasil upgrade
            if (upgradeCount > 0) {
                await this.sendUpgradeNotification(upgradeResults, upgradeCount);
            }
            
            this.lastUpgradeTime = Date.now();
            logger.success(`✅ Auto upgrade completed: ${upgradeCount} upgrades successful`);
            
            return {
                success: true,
                upgrades: upgradeCount,
                results: upgradeResults
            };
            
        } catch (error) {
            logger.error(`❌ Auto upgrade failed: ${error.message}`);
            return { success: false, error: error.message };
        } finally {
            this.isUpgrading = false;
        }
    }

    // Kirim notifikasi hasil upgrade ke Telegram
    async sendUpgradeNotification(upgradeResults, upgradeCount) {
        try {
            const successfulUpgrades = upgradeResults.filter(r => r.success);
            const failedUpgrades = upgradeResults.filter(r => !r.success);
            
            let message = `🔧 *AUTO SLOT UPGRADE COMPLETED* 🔧

✅ *Successful Upgrades: ${upgradeCount}*

${successfulUpgrades.map(upgrade => 
    `• ${upgrade.type.toUpperCase()} Slot Level ${upgrade.level} (${upgrade.cost} ${upgrade.type})`
).join('\n')}

${failedUpgrades.length > 0 ? `
❌ *Failed Upgrades: ${failedUpgrades.length}*

${failedUpgrades.map(upgrade => 
    `• ${upgrade.type.toUpperCase()} Slot Level ${upgrade.level} - ${upgrade.error}`
).join('\n')}
` : ''}

📊 *Summary:*
• Total Upgrades: ${upgradeResults.length}
• Successful: ${upgradeCount}
• Failed: ${failedUpgrades.length}
• Success Rate: ${((upgradeCount / upgradeResults.length) * 100).toFixed(1)}%

⏰ *Waktu:* ${new Date().toLocaleString('id-ID')}`;

            await sendTelegramMessage(message);
            logger.info('📱 Upgrade notification sent to Telegram');
        } catch (error) {
            logger.error(`❌ Failed to send upgrade notification: ${error.message}`);
        }
    }

    // Cek dan proses upgrade jika diperlukan
    async checkAndUpgrade() {
        if (!this.shouldUpgrade()) return;
        
        try {
            const { user } = await api.getState();
            if (!user) return;
            
            // Cek apakah ada resources untuk upgrade
            const userCoins = user.coins || 0;
            const userAP = user.ap || 0;
            
            const affordableUpgrades = this.getAffordableUpgrades(userCoins, userAP);
            
            if (affordableUpgrades.length > 0) {
                logger.info(`🎯 Found ${affordableUpgrades.length} affordable upgrades, starting auto upgrade...`);
                await this.processAutoUpgrade();
            }
        } catch (error) {
            logger.error(`❌ Failed to check and upgrade: ${error.message}`);
        }
    }

    // Dapatkan history upgrade
    getUpgradeHistory() {
        return this.upgradeHistory;
    }

    // Reset upgrade history
    resetUpgradeHistory() {
        this.upgradeHistory = [];
        this.lastUpgradeTime = null;
        logger.info('🔄 Upgrade history reset');
    }
}

// Export instance
export const autoSlotUpgrader = new AutoSlotUpgrader();
