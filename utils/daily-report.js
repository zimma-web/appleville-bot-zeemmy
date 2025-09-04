// =================================================================
// DAILY REPORT - Sistem Laporan Harian
// Generate dan kirim laporan harian ke Telegram
// =================================================================

import { logger } from './logger.js';
import { sendTelegramMessage } from './telegram.js';
import { profitTracker } from './profit-tracker.js';
import { performanceMetrics } from './performance-metrics.js';
import { autoPrestige } from './auto-prestige.js';
import fs from 'fs';
import path from 'path';

export class DailyReport {
    constructor() {
        this.reportFile = path.join(process.cwd(), 'daily-reports.json');
        this.settings = {
            enabled: true,
            reportTime: '08:00', // Waktu laporan harian (24h format)
            timezone: 'Asia/Jakarta',
            includeCharts: true,
            includeRecommendations: true
        };
        this.reports = [];
        this.loadReports();
    }

    // Load reports from file
    loadReports() {
        try {
            if (fs.existsSync(this.reportFile)) {
                const data = JSON.parse(fs.readFileSync(this.reportFile, 'utf8'));
                this.reports = data.reports || [];
                logger.info('📊 Daily reports loaded successfully');
            }
        } catch (error) {
            logger.warn(`Failed to load daily reports: ${error.message}`);
        }
    }

    // Save reports to file
    saveReports() {
        try {
            const data = {
                reports: this.reports,
                lastUpdate: Date.now()
            };
            fs.writeFileSync(this.reportFile, JSON.stringify(data, null, 2));
        } catch (error) {
            logger.warn(`Failed to save daily reports: ${error.message}`);
        }
    }

    // Generate daily report
    async generateDailyReport() {
        try {
            const now = new Date();
            const today = now.toISOString().split('T')[0];
            
            // Check if report already exists for today
            const existingReport = this.reports.find(r => r.date === today);
            if (existingReport) {
                logger.info('📊 Daily report already exists for today');
                return existingReport;
            }

            // Get data from trackers
            const profitData = profitTracker.generateReport();
            const performanceData = performanceMetrics.generateReport();
            const prestigeData = autoPrestige.getSessionStats();
            const upgradeHistory = autoPrestige.getUpgradeHistory(5);

            // Generate report
            const report = {
                date: today,
                timestamp: now.getTime(),
                profit: {
                    totalCoinProfit: profitData.summary.totalCoinProfit,
                    totalAPProfit: profitData.summary.totalAPProfit,
                    sessionHours: profitData.summary.sessionHours,
                    coinsPerHour: profitData.summary.coinsPerHour,
                    apPerHour: profitData.summary.apPerHour,
                    totalHarvests: profitData.summary.totalHarvests,
                    efficiency: profitData.summary.efficiency
                },
                performance: {
                    successRate: performanceData.summary.successRate,
                    uptime: performanceData.summary.uptime,
                    operationsPerHour: performanceData.summary.operationsPerHour,
                    totalOperations: performanceData.summary.totalOperations,
                    harvestSpeed: performanceData.performance.harvestSpeed,
                    plantSpeed: performanceData.performance.plantSpeed,
                    boosterSpeed: performanceData.performance.boosterSpeed,
                    performanceScore: performanceMetrics.getPerformanceScore()
                },
                prestige: {
                    sessionUpgrades: prestigeData.sessionUpgrades,
                    maxUpgrades: prestigeData.maxUpgrades,
                    remainingUpgrades: prestigeData.remainingUpgrades,
                    isEnabled: prestigeData.isEnabled
                },
                upgrades: upgradeHistory,
                summary: this.generateSummary(profitData, performanceData, prestigeData)
            };

            // Save report
            this.reports.push(report);
            this.saveReports();

            logger.info('📊 Daily report generated successfully');
            return report;

        } catch (error) {
            logger.error(`❌ Error generating daily report: ${error.message}`);
            return null;
        }
    }

    // Generate summary
    generateSummary(profitData, performanceData, prestigeData) {
        const summary = {
            grade: 'A',
            highlights: [],
            concerns: [],
            recommendations: []
        };

        // Calculate grade based on performance
        const performanceScore = performanceMetrics.getPerformanceScore();
        if (performanceScore >= 90) summary.grade = 'A';
        else if (performanceScore >= 80) summary.grade = 'B';
        else if (performanceScore >= 70) summary.grade = 'C';
        else if (performanceScore >= 60) summary.grade = 'D';
        else summary.grade = 'F';

        // Add highlights
        if (profitData.summary.totalCoinProfit > 10000) {
            summary.highlights.push(`💰 Profit tinggi: ${profitData.summary.totalCoinProfit.toLocaleString()} coins`);
        }
        if (profitData.summary.totalHarvests > 100) {
            summary.highlights.push(`🌾 Harvest banyak: ${profitData.summary.totalHarvests} panen`);
        }
        if (performanceData.summary.successRate > 95) {
            summary.highlights.push(`📊 Success rate tinggi: ${performanceData.summary.successRate}`);
        }
        if (prestigeData.sessionUpgrades > 0) {
            summary.highlights.push(`🔄 Auto prestige aktif: ${prestigeData.sessionUpgrades} upgrade`);
        }

        // Add concerns
        if (profitData.summary.coinsPerHour < 100) {
            summary.concerns.push(`⚠️ Profit rate rendah: ${profitData.summary.coinsPerHour.toFixed(2)} coins/h`);
        }
        if (performanceData.summary.successRate < 90) {
            summary.concerns.push(`⚠️ Success rate rendah: ${performanceData.summary.successRate}`);
        }
        if (profitData.summary.efficiency < 50) {
            summary.concerns.push(`⚠️ Efisiensi rendah: ${profitData.summary.efficiency.toFixed(2)}`);
        }

        // Add recommendations
        if (profitData.summary.coinsPerHour < 200) {
            summary.recommendations.push('💡 Pertimbangkan seed yang lebih profitable');
        }
        if (performanceData.summary.successRate < 95) {
            summary.recommendations.push('💡 Periksa koneksi internet dan delay settings');
        }
        if (prestigeData.remainingUpgrades > 0) {
            summary.recommendations.push('💡 Aktifkan auto prestige untuk upgrade otomatis');
        }
        if (profitData.summary.sessionHours < 1) {
            summary.recommendations.push('💡 Jalankan bot lebih lama untuk hasil maksimal');
        }

        return summary;
    }

    // Format report for Telegram
    formatReportForTelegram(report) {
        const profit = report.profit;
        const performance = report.performance;
        const prestige = report.prestige;
        const summary = report.summary;

        let message = `📊 *DAILY REPORT - ${report.date}* 📊

🏆 *GRADE: ${summary.grade}*

💰 *PROFIT SUMMARY*
• Total Profit: ${profit.totalCoinProfit.toLocaleString()} coins, ${profit.totalAPProfit.toLocaleString()} AP
• Session Time: ${profit.sessionHours.toFixed(2)}h
• Profit Rate: ${profit.coinsPerHour.toFixed(2)} coins/h, ${profit.apPerHour.toFixed(2)} AP/h
• Total Harvests: ${profit.totalHarvests}
• Efficiency: ${profit.efficiency.toFixed(2)}

📊 *PERFORMANCE SUMMARY*
• Success Rate: ${performance.successRate}
• Uptime: ${performance.uptime}
• Operations/Hour: ${performance.operationsPerHour}
• Harvest Speed: ${performance.harvestSpeed}
• Plant Speed: ${performance.plantSpeed}
• Performance Score: ${performance.performanceScore}/100

🔄 *PRESTIGE SUMMARY*
• Session Upgrades: ${prestige.sessionUpgrades}/${prestige.maxUpgrades}
• Auto Prestige: ${prestige.isEnabled ? '✅ Enabled' : '❌ Disabled'}
• Remaining Upgrades: ${prestige.remainingUpgrades}`;

        // Add highlights
        if (summary.highlights.length > 0) {
            message += `\n\n🎉 *HIGHLIGHTS*`;
            summary.highlights.forEach(highlight => {
                message += `\n• ${highlight}`;
            });
        }

        // Add concerns
        if (summary.concerns.length > 0) {
            message += `\n\n⚠️ *CONCERNS*`;
            summary.concerns.forEach(concern => {
                message += `\n• ${concern}`;
            });
        }

        // Add recommendations
        if (summary.recommendations.length > 0) {
            message += `\n\n💡 *RECOMMENDATIONS*`;
            summary.recommendations.forEach(recommendation => {
                message += `\n• ${recommendation}`;
            });
        }

        // Add upgrade history
        if (report.upgrades.length > 0) {
            message += `\n\n🔄 *RECENT UPGRADES*`;
            report.upgrades.forEach(upgrade => {
                const time = new Date(upgrade.timestamp).toLocaleTimeString('id-ID');
                message += `\n• ${upgrade.upgrade.name} (${upgrade.upgrade.cost.toLocaleString()} AP) - ${time}`;
            });
        }

        message += `\n\n⏰ *Generated:* ${new Date().toLocaleString('id-ID')}`;

        return message;
    }

    // Send daily report
    async sendDailyReport() {
        try {
            if (!this.settings.enabled) {
                logger.info('📊 Daily report disabled');
                return;
            }

            const report = await this.generateDailyReport();
            if (!report) {
                logger.error('❌ Failed to generate daily report');
                return;
            }

            const message = this.formatReportForTelegram(report);
            await sendTelegramMessage(message);
            
            logger.info('📊 Daily report sent successfully');
            return report;

        } catch (error) {
            logger.error(`❌ Error sending daily report: ${error.message}`);
        }
    }

    // Get report history
    getReportHistory(limit = 7) {
        return this.reports.slice(-limit);
    }

    // Get report by date
    getReportByDate(date) {
        return this.reports.find(r => r.date === date);
    }

    // Get weekly summary
    getWeeklySummary() {
        const last7Days = this.reports.slice(-7);
        if (last7Days.length === 0) return null;

        const totalProfit = last7Days.reduce((sum, r) => sum + r.profit.totalCoinProfit, 0);
        const totalAP = last7Days.reduce((sum, r) => sum + r.profit.totalAPProfit, 0);
        const totalHarvests = last7Days.reduce((sum, r) => sum + r.profit.totalHarvests, 0);
        const avgPerformanceScore = last7Days.reduce((sum, r) => sum + r.performance.performanceScore, 0) / last7Days.length;

        return {
            period: '7 days',
            totalProfit,
            totalAP,
            totalHarvests,
            avgPerformanceScore: avgPerformanceScore.toFixed(2),
            reports: last7Days.length
        };
    }

    // Set settings
    setSettings(settings) {
        this.settings = { ...this.settings, ...settings };
        logger.info('⚙️ Daily report settings updated');
    }

    // Enable/disable
    setEnabled(enabled) {
        this.settings.enabled = enabled;
        logger.info(`📊 Daily report ${enabled ? 'enabled' : 'disabled'}`);
    }
}

// Export singleton instance
export const dailyReport = new DailyReport();
