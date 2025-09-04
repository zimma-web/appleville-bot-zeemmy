// =================================================================
// SMART ALERTS - Sistem Notifikasi Cerdas
// Alert otomatis untuk masalah penting dan milestone
// =================================================================

import { logger } from './logger.js';
import { sendTelegramMessage } from './telegram.js';

export class SmartAlerts {
    constructor() {
        this.alertHistory = [];
        this.alertCooldowns = new Map(); // Prevent spam alerts
        this.thresholds = {
            lowCoins: 100,
            lowAP: 1000,
            highErrorRate: 10, // 10% error rate
            longDowntime: 300000, // 5 minutes
            captchaTimeout: 600000 // 10 minutes
        };
        this.lastAlertTimes = new Map();
    }

    // Set alert thresholds
    setThresholds(thresholds) {
        this.thresholds = { ...this.thresholds, ...thresholds };
    }

    // Check if alert should be sent (cooldown)
    shouldSendAlert(alertType, cooldownMs = 300000) { // 5 minutes default cooldown
        const now = Date.now();
        const lastAlert = this.lastAlertTimes.get(alertType) || 0;
        
        if (now - lastAlert < cooldownMs) {
            return false;
        }
        
        this.lastAlertTimes.set(alertType, now);
        return true;
    }

    // Record alert
    recordAlert(alertType, message, severity = 'info') {
        const alert = {
            timestamp: Date.now(),
            type: alertType,
            message: message,
            severity: severity
        };
        
        this.alertHistory.push(alert);
        
        // Keep only last 100 alerts
        if (this.alertHistory.length > 100) {
            this.alertHistory = this.alertHistory.slice(-100);
        }
    }

    // Low balance alert
    checkLowBalance(userData) {
        if (!userData) userData = {};
        const coins = userData.coins || 0;
        const ap = userData.ap || 0;
        
        if (coins < this.thresholds.lowCoins) {
            if (this.shouldSendAlert('low_coins', 600000)) { // 10 minutes cooldown
                const message = `🚨 *LOW BALANCE ALERT* 🚨

💰 *Koin Habis!*
• Sisa: ${coins} koin
• Threshold: ${this.thresholds.lowCoins} koin
• Status: ⚠️ KRITIS

🔄 *Rekomendasi:*
• Bot akan berhenti jika koin habis
• Segera top up atau ganti strategy
• Pertimbangkan seed yang lebih murah

⏰ *Waktu:* ${new Date().toLocaleString('id-ID')}`;

                this.recordAlert('low_coins', message, 'critical');
                sendTelegramMessage(message);
                logger.warn('🚨 Low coins alert sent!');
            }
        }

        if (ap < this.thresholds.lowAP) {
            if (this.shouldSendAlert('low_ap', 600000)) { // 10 minutes cooldown
                const message = `🚨 *LOW AP ALERT* 🚨

🍎 *AP Habis!*
• Sisa: ${ap} AP
• Threshold: ${this.thresholds.lowAP} AP
• Status: ⚠️ KRITIS

🔄 *Rekomendasi:*
• Bot akan berhenti jika AP habis
• Segera farming untuk mendapatkan AP
• Pertimbangkan seed yang menghasilkan AP

⏰ *Waktu:* ${new Date().toLocaleString('id-ID')}`;

                this.recordAlert('low_ap', message, 'critical');
                sendTelegramMessage(message);
                logger.warn('🚨 Low AP alert sent!');
            }
        }
    }

    // Error rate alert
    checkErrorRate(errorCount, totalOperations) {
        if (totalOperations === 0) return;
        
        const errorRate = (errorCount / totalOperations) * 100;
        
        if (errorRate > this.thresholds.highErrorRate) {
            if (this.shouldSendAlert('high_error_rate', 900000)) { // 15 minutes cooldown
                const message = `🚨 *HIGH ERROR RATE ALERT* 🚨

❌ *Error Rate Tinggi!*
• Error Rate: ${errorRate.toFixed(2)}%
• Threshold: ${this.thresholds.highErrorRate}%
• Total Operations: ${totalOperations}
• Errors: ${errorCount}

🔄 *Rekomendasi:*
• Periksa koneksi internet
• Restart bot jika perlu
• Periksa signature dan cookie

⏰ *Waktu:* ${new Date().toLocaleString('id-ID')}`;

                this.recordAlert('high_error_rate', message, 'warning');
                sendTelegramMessage(message);
                logger.warn('🚨 High error rate alert sent!');
            }
        }
    }

    // Captcha timeout alert
    checkCaptchaTimeout(captchaTimestamp) {
        if (!captchaTimestamp) return;
        
        const now = Date.now();
        const captchaDuration = now - captchaTimestamp;
        
        if (captchaDuration > this.thresholds.captchaTimeout) {
            if (this.shouldSendAlert('captcha_timeout', 1800000)) { // 30 minutes cooldown
                const minutes = Math.floor(captchaDuration / 60000);
                const message = `🚨 *CAPTCHA TIMEOUT ALERT* 🚨

🤖 *Bot Terhenti Karena CAPTCHA!*
• Durasi: ${minutes} menit
• Status: ⚠️ KRITIS
• Bot tidak bisa farming

🔄 *Rekomendasi:*
• Selesaikan CAPTCHA di browser
• Restart bot setelah CAPTCHA selesai
• Pertimbangkan delay yang lebih besar

⏰ *Waktu:* ${new Date().toLocaleString('id-ID')}`;

                this.recordAlert('captcha_timeout', message, 'critical');
                sendTelegramMessage(message);
                logger.warn('🚨 Captcha timeout alert sent!');
            }
        }
    }

    // Milestone alert
    checkMilestones(userData, profitData) {
        if (!userData) userData = {};
        const coins = userData.coins || 0;
        const ap = userData.ap || 0;
        const totalHarvests = profitData?.totalHarvests || 0;

        // Coin milestones
        const coinMilestones = [1000, 5000, 10000, 50000, 100000, 500000, 1000000];
        for (const milestone of coinMilestones) {
            if (coins >= milestone && coins < milestone + 100) {
                if (this.shouldSendAlert(`coin_milestone_${milestone}`, 3600000)) { // 1 hour cooldown
                    const message = `🎉 *COIN MILESTONE ACHIEVED!* 🎉

💰 *Pencapaian Koin!*
• Total Koin: ${coins.toLocaleString()}
• Milestone: ${milestone.toLocaleString()} koin
• Status: 🎯 BERHASIL

🏆 *Selamat!* Bot berhasil mencapai milestone koin!

⏰ *Waktu:* ${new Date().toLocaleString('id-ID')}`;

                    this.recordAlert(`coin_milestone_${milestone}`, message, 'success');
                    sendTelegramMessage(message);
                    logger.info(`🎉 Coin milestone ${milestone} achieved!`);
                }
            }
        }

        // AP milestones
        const apMilestones = [10000, 50000, 100000, 500000, 1000000, 5000000, 10000000];
        for (const milestone of apMilestones) {
            if (ap >= milestone && ap < milestone + 1000) {
                if (this.shouldSendAlert(`ap_milestone_${milestone}`, 3600000)) { // 1 hour cooldown
                    const message = `🎉 *AP MILESTONE ACHIEVED!* 🎉

🍎 *Pencapaian AP!*
• Total AP: ${ap.toLocaleString()}
• Milestone: ${milestone.toLocaleString()} AP
• Status: 🎯 BERHASIL

🏆 *Selamat!* Bot berhasil mencapai milestone AP!

⏰ *Waktu:* ${new Date().toLocaleString('id-ID')}`;

                    this.recordAlert(`ap_milestone_${milestone}`, message, 'success');
                    sendTelegramMessage(message);
                    logger.info(`🎉 AP milestone ${milestone} achieved!`);
                }
            }
        }

        // Harvest milestones
        const harvestMilestones = [100, 500, 1000, 5000, 10000, 50000, 100000];
        for (const milestone of harvestMilestones) {
            if (totalHarvests >= milestone && totalHarvests < milestone + 10) {
                if (this.shouldSendAlert(`harvest_milestone_${milestone}`, 3600000)) { // 1 hour cooldown
                    const message = `🎉 *HARVEST MILESTONE ACHIEVED!* 🎉

🌾 *Pencapaian Panen!*
• Total Panen: ${totalHarvests.toLocaleString()}
• Milestone: ${milestone.toLocaleString()} panen
• Status: 🎯 BERHASIL

🏆 *Selamat!* Bot berhasil mencapai milestone panen!

⏰ *Waktu:* ${new Date().toLocaleString('id-ID')}`;

                    this.recordAlert(`harvest_milestone_${milestone}`, message, 'success');
                    sendTelegramMessage(message);
                    logger.info(`🎉 Harvest milestone ${milestone} achieved!`);
                }
            }
        }
    }

    // Performance alert
    checkPerformance(performanceData) {
        const successRate = performanceData.overall?.successRate || 100;
        const uptimeHours = performanceData.overall?.uptimeHours || 0;

        // Low success rate
        if (successRate < 90) {
            if (this.shouldSendAlert('low_success_rate', 1800000)) { // 30 minutes cooldown
                const message = `⚠️ *PERFORMANCE ALERT* ⚠️

📊 *Success Rate Rendah!*
• Success Rate: ${successRate.toFixed(2)}%
• Threshold: 90%
• Status: ⚠️ PERINGATAN

🔄 *Rekomendasi:*
• Periksa koneksi internet
• Periksa delay settings
• Restart bot jika perlu

⏰ *Waktu:* ${new Date().toLocaleString('id-ID')}`;

                this.recordAlert('low_success_rate', message, 'warning');
                sendTelegramMessage(message);
                logger.warn('⚠️ Low success rate alert sent!');
            }
        }

        // Long uptime milestone
        const uptimeMilestones = [1, 6, 12, 24, 48, 72, 168]; // hours
        for (const milestone of uptimeMilestones) {
            if (uptimeHours >= milestone && uptimeHours < milestone + 0.1) {
                if (this.shouldSendAlert(`uptime_milestone_${milestone}`, 3600000)) { // 1 hour cooldown
                    const message = `🎉 *UPTIME MILESTONE ACHIEVED!* 🎉

⏰ *Pencapaian Uptime!*
• Total Uptime: ${uptimeHours.toFixed(2)} jam
• Milestone: ${milestone} jam
• Status: 🎯 BERHASIL

🏆 *Selamat!* Bot berhasil berjalan stabil!

⏰ *Waktu:* ${new Date().toLocaleString('id-ID')}`;

                    this.recordAlert(`uptime_milestone_${milestone}`, message, 'success');
                    sendTelegramMessage(message);
                    logger.info(`🎉 Uptime milestone ${milestone}h achieved!`);
                }
            }
        }
    }

    // Get alert history
    getAlertHistory(limit = 10) {
        return this.alertHistory.slice(-limit);
    }

    // Clear alert history
    clearAlertHistory() {
        this.alertHistory = [];
        this.lastAlertTimes.clear();
        logger.info('🔄 Alert history cleared');
    }
}

// Export singleton instance
export const smartAlerts = new SmartAlerts();
