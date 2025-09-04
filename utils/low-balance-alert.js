// =================================================================
// LOW BALANCE ALERT - Sistem Peringatan Balance Rendah
// Alert cerdas untuk balance koin dan AP yang rendah
// =================================================================

import { logger } from './logger.js';
import { sendTelegramMessage } from './telegram.js';

export class LowBalanceAlert {
    constructor() {
        this.settings = {
            enabled: true,
            thresholds: {
                coins: {
                    warning: 500,
                    critical: 100,
                    emergency: 50
                },
                ap: {
                    warning: 5000,
                    critical: 1000,
                    emergency: 500
                }
            },
            cooldowns: {
                warning: 1800000, // 30 menit
                critical: 900000, // 15 menit
                emergency: 300000 // 5 menit
            },
            autoActions: {
                stopBot: true,
                stopThreshold: {
                    coins: 10,
                    ap: 100
                }
            }
        };
        this.alertHistory = [];
        this.lastAlertTimes = new Map();
    }

    // Set settings
    setSettings(settings) {
        this.settings = { ...this.settings, ...settings };
        logger.info('⚙️ Low balance alert settings updated');
    }

    // Check balance and send alerts
    async checkBalance(userData, bot) {
        if (!this.settings.enabled) return;
        if (!userData) userData = {};

        const coins = userData.coins || 0;
        const ap = userData.ap || 0;

        // Check coins
        await this.checkCoins(coins, bot);
        
        // Check AP
        await this.checkAP(ap, bot);

        // Check emergency stop
        if (this.settings.autoActions.stopBot) {
            await this.checkEmergencyStop(coins, ap, bot);
        }
    }

    // Check coins balance
    async checkCoins(coins, bot) {
        const thresholds = this.settings.thresholds.coins;
        const cooldowns = this.settings.cooldowns;

        if (coins <= thresholds.emergency) {
            await this.sendAlert('coins', 'emergency', coins, thresholds.emergency, bot);
        } else if (coins <= thresholds.critical) {
            await this.sendAlert('coins', 'critical', coins, thresholds.critical, bot);
        } else if (coins <= thresholds.warning) {
            await this.sendAlert('coins', 'warning', coins, thresholds.warning, bot);
        }
    }

    // Check AP balance
    async checkAP(ap, bot) {
        const thresholds = this.settings.thresholds.ap;
        const cooldowns = this.settings.cooldowns;

        if (ap <= thresholds.emergency) {
            await this.sendAlert('ap', 'emergency', ap, thresholds.emergency, bot);
        } else if (ap <= thresholds.critical) {
            await this.sendAlert('ap', 'critical', ap, thresholds.critical, bot);
        } else if (ap <= thresholds.warning) {
            await this.sendAlert('ap', 'warning', ap, thresholds.warning, bot);
        }
    }

    // Send alert
    async sendAlert(type, level, current, threshold, bot) {
        const alertKey = `${type}_${level}`;
        const cooldown = this.settings.cooldowns[level];

        // Check cooldown
        if (!this.shouldSendAlert(alertKey, cooldown)) {
            return;
        }

        const emoji = this.getAlertEmoji(level);
        const title = this.getAlertTitle(type, level);
        const message = this.formatAlertMessage(type, level, current, threshold, bot);

        // Record alert
        this.recordAlert(alertKey, message, level);

        // Send Telegram message
        await sendTelegramMessage(message);

        // Log alert
        logger.warn(`${emoji} ${title}: ${current} ${type.toUpperCase()}`);

        // Update last alert time
        this.lastAlertTimes.set(alertKey, Date.now());
    }

    // Check if should send alert (cooldown)
    shouldSendAlert(alertKey, cooldown) {
        const now = Date.now();
        const lastAlert = this.lastAlertTimes.get(alertKey) || 0;
        return now - lastAlert >= cooldown;
    }

    // Get alert emoji
    getAlertEmoji(level) {
        switch (level) {
            case 'emergency': return '🚨';
            case 'critical': return '⚠️';
            case 'warning': return '🔔';
            default: return '📢';
        }
    }

    // Get alert title
    getAlertTitle(type, level) {
        const typeName = type.toUpperCase();
        switch (level) {
            case 'emergency': return `${typeName} EMERGENCY`;
            case 'critical': return `${typeName} CRITICAL`;
            case 'warning': return `${typeName} WARNING`;
            default: return `${typeName} ALERT`;
        }
    }

    // Format alert message
    formatAlertMessage(type, level, current, threshold, bot) {
        const emoji = this.getAlertEmoji(level);
        const typeName = type.toUpperCase();
        const typeIcon = type === 'coins' ? '💰' : '🍎';
        
        let message = `${emoji} *${typeName} ${level.toUpperCase()} ALERT* ${emoji}

${typeIcon} *${typeName} Balance Rendah!*
• Current: ${current.toLocaleString()} ${type}
• Threshold: ${threshold.toLocaleString()} ${type}
• Level: ${level.toUpperCase()}

🔄 *Rekomendasi:*`;

        // Add specific recommendations
        if (type === 'coins') {
            if (level === 'emergency') {
                message += `
• ⚠️ KRITIS! Bot akan berhenti jika koin habis
• 🛑 Segera top up atau ganti strategy
• 💡 Pertimbangkan seed yang lebih murah`;
            } else if (level === 'critical') {
                message += `
• ⚠️ Balance sangat rendah
• 🔄 Segera farming untuk mendapatkan koin
• 💡 Pertimbangkan seed yang menghasilkan koin`;
            } else {
                message += `
• 🔔 Balance mulai rendah
• 📊 Monitor balance secara berkala
• 💡 Pertimbangkan optimasi strategy`;
            }
        } else if (type === 'ap') {
            if (level === 'emergency') {
                message += `
• ⚠️ KRITIS! Bot akan berhenti jika AP habis
• 🛑 Segera farming untuk mendapatkan AP
• 💡 Pertimbangkan seed yang menghasilkan AP`;
            } else if (level === 'critical') {
                message += `
• ⚠️ AP sangat rendah
• 🔄 Segera farming untuk mendapatkan AP
• 💡 Pertimbangkan seed yang menghasilkan AP`;
            } else {
                message += `
• 🔔 AP mulai rendah
• 📊 Monitor AP secara berkala
• 💡 Pertimbangkan optimasi strategy`;
            }
        }

        message += `

⏰ *Waktu:* ${new Date().toLocaleString('id-ID')}`;

        return message;
    }

    // Check emergency stop
    async checkEmergencyStop(coins, ap, bot) {
        const stopThreshold = this.settings.autoActions.stopThreshold;
        
        if (coins <= stopThreshold.coins || ap <= stopThreshold.ap) {
            if (this.shouldSendAlert('emergency_stop', 300000)) { // 5 menit cooldown
                const message = `🚨 *EMERGENCY STOP ALERT* 🚨

🛑 *Bot Akan Berhenti!*
• Koin: ${coins} (threshold: ${stopThreshold.coins})
• AP: ${ap} (threshold: ${stopThreshold.ap})
• Status: ⚠️ KRITIS

🔄 *Aksi Otomatis:*
• Bot akan berhenti untuk mencegah error
• Segera top up balance
• Restart bot setelah balance cukup

⏰ *Waktu:* ${new Date().toLocaleString('id-ID')}`;

                this.recordAlert('emergency_stop', message, 'emergency');
                await sendTelegramMessage(message);
                
                // Stop bot
                if (bot && bot.stop) {
                    logger.warn('🛑 Emergency stop: Balance terlalu rendah');
                    bot.stop();
                }
            }
        }
    }

    // Record alert
    recordAlert(alertKey, message, level) {
        const alert = {
            timestamp: Date.now(),
            key: alertKey,
            message: message,
            level: level
        };
        
        this.alertHistory.push(alert);
        
        // Keep only last 100 alerts
        if (this.alertHistory.length > 100) {
            this.alertHistory = this.alertHistory.slice(-100);
        }
    }

    // Get alert history
    getAlertHistory(limit = 10) {
        return this.alertHistory.slice(-limit);
    }

    // Get alert status
    getAlertStatus() {
        return {
            enabled: this.settings.enabled,
            thresholds: this.settings.thresholds,
            cooldowns: this.settings.cooldowns,
            autoActions: this.settings.autoActions,
            lastAlerts: Array.from(this.lastAlertTimes.entries()).map(([key, time]) => ({
                key,
                time: new Date(time).toLocaleString('id-ID')
            }))
        };
    }

    // Clear alert history
    clearAlertHistory() {
        this.alertHistory = [];
        this.lastAlertTimes.clear();
        logger.info('🔄 Low balance alert history cleared');
    }

    // Set enabled
    setEnabled(enabled) {
        this.settings.enabled = enabled;
        logger.info(`🔔 Low balance alert ${enabled ? 'enabled' : 'disabled'}`);
    }
}

// Export singleton instance
export const lowBalanceAlert = new LowBalanceAlert();
