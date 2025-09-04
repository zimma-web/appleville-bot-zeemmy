// =================================================================
// AUTO PRESTIGE - Sistem Upgrade Otomatis
// Otomatis upgrade prestige saat AP cukup dan sesuai kriteria
// =================================================================

import { logger } from './logger.js';
import { api } from '../services/api.js';
import { sendTelegramMessage } from './telegram.js';

export class AutoPrestige {
    constructor() {
        this.isEnabled = false;
        this.settings = {
            autoUpgrade: true,
            minAPReserve: 10000, // Minimal AP yang harus disisakan
            upgradeThreshold: 50000, // Minimal AP untuk upgrade
            checkInterval: 300000, // 5 menit
            maxUpgradesPerSession: 5, // Maksimal upgrade per session
            priority: ['prestige', 'ap_multiplier', 'coin_multiplier', 'harvest_speed']
        };
        this.upgradeHistory = [];
        this.lastCheckTime = 0;
        this.sessionUpgrades = 0;
    }

    // Enable/disable auto prestige
    setEnabled(enabled) {
        this.isEnabled = enabled;
        logger.info(`🔄 Auto Prestige ${enabled ? 'diaktifkan' : 'dinonaktifkan'}`);
    }

    // Set settings
    setSettings(settings) {
        this.settings = { ...this.settings, ...settings };
        logger.info('⚙️ Auto Prestige settings updated');
    }

    // Check if should upgrade
    async checkAndUpgrade(userData) {
        if (!this.isEnabled) return false;
        if (!userData) userData = {};

        const now = Date.now();
        if (now - this.lastCheckTime < this.settings.checkInterval) return false;

        this.lastCheckTime = now;

        try {
            const { state } = await api.getState();
            if (!state || !state.user) return false;

            const user = state.user;
            const currentAP = user.ap || 0;
            const currentPrestige = user.prestige || 0;

            // Check if enough AP for upgrade
            if (currentAP < this.settings.upgradeThreshold) {
                logger.debug(`⏳ AP belum cukup untuk upgrade: ${currentAP} < ${this.settings.upgradeThreshold}`);
                return false;
            }

            // Check session limit
            if (this.sessionUpgrades >= this.settings.maxUpgradesPerSession) {
                logger.info(`⏳ Maksimal upgrade per session tercapai: ${this.sessionUpgrades}`);
                return false;
            }

            // Check available upgrades
            const availableUpgrades = await this.getAvailableUpgrades(user);
            if (availableUpgrades.length === 0) {
                logger.debug('⏳ Tidak ada upgrade yang tersedia');
                return false;
            }

            // Select best upgrade
            const selectedUpgrade = this.selectBestUpgrade(availableUpgrades, user);
            if (!selectedUpgrade) {
                logger.debug('⏳ Tidak ada upgrade yang sesuai kriteria');
                return false;
            }

            // Perform upgrade
            const success = await this.performUpgrade(selectedUpgrade, user);
            if (success) {
                this.sessionUpgrades++;
                this.recordUpgrade(selectedUpgrade, user);
                return true;
            }

        } catch (error) {
            logger.error(`❌ Error checking auto prestige: ${error.message}`);
        }

        return false;
    }

    // Get available upgrades
    async getAvailableUpgrades(user) {
        try {
            const { state } = await api.getState();
            if (!state || !state.upgrades) return [];

            const availableUpgrades = [];
            const currentAP = user.ap || 0;

            for (const upgrade of state.upgrades) {
                if (upgrade.available && upgrade.cost <= currentAP) {
                    availableUpgrades.push({
                        id: upgrade.id,
                        name: upgrade.name,
                        cost: upgrade.cost,
                        description: upgrade.description,
                        type: this.getUpgradeType(upgrade.name),
                        priority: this.getUpgradePriority(upgrade.name)
                    });
                }
            }

            return availableUpgrades;
        } catch (error) {
            logger.error(`❌ Error getting available upgrades: ${error.message}`);
            return [];
        }
    }

    // Get upgrade type
    getUpgradeType(name) {
        const nameLower = name.toLowerCase();
        if (nameLower.includes('prestige')) return 'prestige';
        if (nameLower.includes('ap') && nameLower.includes('multiplier')) return 'ap_multiplier';
        if (nameLower.includes('coin') && nameLower.includes('multiplier')) return 'coin_multiplier';
        if (nameLower.includes('harvest') && nameLower.includes('speed')) return 'harvest_speed';
        if (nameLower.includes('plant') && nameLower.includes('speed')) return 'plant_speed';
        if (nameLower.includes('booster') && nameLower.includes('duration')) return 'booster_duration';
        return 'other';
    }

    // Get upgrade priority
    getUpgradePriority(name) {
        const type = this.getUpgradeType(name);
        const priorityIndex = this.settings.priority.indexOf(type);
        return priorityIndex >= 0 ? priorityIndex : 999;
    }

    // Select best upgrade
    selectBestUpgrade(availableUpgrades, user) {
        if (availableUpgrades.length === 0) return null;

        // Sort by priority and cost
        const sortedUpgrades = availableUpgrades.sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            return a.cost - b.cost; // Prefer cheaper upgrades
        });

        // Check if we can afford the upgrade
        const selectedUpgrade = sortedUpgrades[0];
        const currentAP = user.ap || 0;
        const remainingAP = currentAP - selectedUpgrade.cost;

        if (remainingAP < this.settings.minAPReserve) {
            logger.debug(`⏳ Upgrade ${selectedUpgrade.name} akan membuat AP terlalu rendah: ${remainingAP} < ${this.settings.minAPReserve}`);
            return null;
        }

        return selectedUpgrade;
    }

    // Perform upgrade
    async performUpgrade(upgrade, user) {
        try {
            logger.info(`🔄 Auto upgrading: ${upgrade.name} (${upgrade.cost} AP)`);
            
            const result = await api.upgradePrestige(upgrade.id);
            
            if (result.ok) {
                logger.success(`✅ Upgrade berhasil: ${upgrade.name}`);
                
                // Send Telegram notification
                const message = `🎉 *AUTO PRESTIGE SUCCESS!* 🎉

🔄 *Upgrade Berhasil!*
• Upgrade: ${upgrade.name}
• Cost: ${upgrade.cost.toLocaleString()} AP
• Type: ${upgrade.type}
• Remaining AP: ${(user.ap - upgrade.cost).toLocaleString()}

📊 *Session Stats:*
• Total Upgrades: ${this.sessionUpgrades + 1}
• Session Limit: ${this.settings.maxUpgradesPerSession}

⏰ *Waktu:* ${new Date().toLocaleString('id-ID')}`;

                await sendTelegramMessage(message);
                return true;
            } else {
                logger.warn(`❌ Upgrade gagal: ${upgrade.name} - ${result.message}`);
                return false;
            }
        } catch (error) {
            logger.error(`❌ Error performing upgrade: ${error.message}`);
            return false;
        }
    }

    // Record upgrade
    recordUpgrade(upgrade, user) {
        const record = {
            timestamp: Date.now(),
            upgrade: upgrade,
            userAP: user.ap,
            remainingAP: user.ap - upgrade.cost,
            sessionUpgrades: this.sessionUpgrades
        };

        this.upgradeHistory.push(record);

        // Keep only last 100 records
        if (this.upgradeHistory.length > 100) {
            this.upgradeHistory = this.upgradeHistory.slice(-100);
        }
    }

    // Get upgrade history
    getUpgradeHistory(limit = 10) {
        return this.upgradeHistory.slice(-limit);
    }

    // Get session stats
    getSessionStats() {
        return {
            sessionUpgrades: this.sessionUpgrades,
            maxUpgrades: this.settings.maxUpgradesPerSession,
            remainingUpgrades: this.settings.maxUpgradesPerSession - this.sessionUpgrades,
            isEnabled: this.isEnabled,
            lastCheckTime: this.lastCheckTime
        };
    }

    // Reset session
    resetSession() {
        this.sessionUpgrades = 0;
        this.lastCheckTime = 0;
        logger.info('🔄 Auto Prestige session reset');
    }

    // Get upgrade recommendations
    async getUpgradeRecommendations(user) {
        try {
            const availableUpgrades = await this.getAvailableUpgrades(user);
            const recommendations = [];

            for (const upgrade of availableUpgrades) {
                const remainingAP = user.ap - upgrade.cost;
                const canAfford = remainingAP >= this.settings.minAPReserve;
                
                recommendations.push({
                    ...upgrade,
                    canAfford,
                    remainingAP,
                    recommendation: canAfford ? 'RECOMMENDED' : 'INSUFFICIENT_AP'
                });
            }

            return recommendations.sort((a, b) => a.priority - b.priority);
        } catch (error) {
            logger.error(`❌ Error getting upgrade recommendations: ${error.message}`);
            return [];
        }
    }
}

// Export singleton instance
export const autoPrestige = new AutoPrestige();
