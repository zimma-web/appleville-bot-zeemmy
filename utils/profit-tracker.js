// =================================================================
// PROFIT TRACKER - Sistem Tracking Profit Real-time
// Menghitung dan melacak keuntungan farming secara detail
// =================================================================

import { logger } from './logger.js';
import fs from 'fs';
import path from 'path';

export class ProfitTracker {
    constructor() {
        this.dataFile = path.join(process.cwd(), 'profit-data.json');
        this.sessionStart = Date.now();
        this.sessionData = {
            startTime: this.sessionStart,
            startCoins: 0,
            startAP: 0,
            currentCoins: 0,
            currentAP: 0,
            totalHarvests: 0,
            totalPlants: 0,
            totalBoosters: 0,
            harvestHistory: [],
            profitHistory: [],
            lastUpdate: this.sessionStart
        };
        this.loadData();
    }

    // Load data dari file
    loadData() {
        try {
            if (fs.existsSync(this.dataFile)) {
                const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
                this.sessionData = { ...this.sessionData, ...data };
                logger.info('📊 Profit data loaded successfully');
            }
        } catch (error) {
            logger.warn(`Failed to load profit data: ${error.message}`);
        }
    }

    // Save data ke file
    saveData() {
        try {
            this.sessionData.lastUpdate = Date.now();
            fs.writeFileSync(this.dataFile, JSON.stringify(this.sessionData, null, 2));
        } catch (error) {
            logger.warn(`Failed to save profit data: ${error.message}`);
        }
    }

    // Initialize session dengan data awal
    initializeSession(userData) {
        if (!userData) userData = {};
        this.sessionData.startCoins = userData.coins || 0;
        this.sessionData.startAP = userData.ap || 0;
        this.sessionData.currentCoins = userData.coins || 0;
        this.sessionData.currentAP = userData.ap || 0;
        this.sessionData.startTime = Date.now();
        this.saveData();
        
        logger.info('💰 Profit tracking session initialized');
        logger.info(`📊 Starting balance: ${this.sessionData.startCoins} coins, ${this.sessionData.startAP} AP`);
    }

    // Update data setelah batch cycle
    updateAfterBatch(userData, harvestCount = 0, plantCount = 0, boosterCount = 0) {
        if (!userData) userData = {};
        const previousCoins = this.sessionData.currentCoins;
        const previousAP = this.sessionData.currentAP;
        
        this.sessionData.currentCoins = userData.coins || 0;
        this.sessionData.currentAP = userData.ap || 0;
        this.sessionData.totalHarvests += harvestCount;
        this.sessionData.totalPlants += plantCount;
        this.sessionData.totalBoosters += boosterCount;

        // Hitung profit
        const coinProfit = this.sessionData.currentCoins - previousCoins;
        const apProfit = this.sessionData.currentAP - previousAP;

        // Record harvest history
        if (harvestCount > 0) {
            this.sessionData.harvestHistory.push({
                timestamp: Date.now(),
                count: harvestCount,
                coinProfit: coinProfit,
                apProfit: apProfit
            });
        }

        // Record profit history
        this.sessionData.profitHistory.push({
            timestamp: Date.now(),
            coins: this.sessionData.currentCoins,
            ap: this.sessionData.currentAP,
            coinProfit: coinProfit,
            apProfit: apProfit
        });

        // Keep only last 1000 records
        if (this.sessionData.harvestHistory.length > 1000) {
            this.sessionData.harvestHistory = this.sessionData.harvestHistory.slice(-1000);
        }
        if (this.sessionData.profitHistory.length > 1000) {
            this.sessionData.profitHistory = this.sessionData.profitHistory.slice(-1000);
        }

        this.saveData();
    }

    // Hitung total profit session
    getSessionProfit() {
        const totalCoinProfit = this.sessionData.currentCoins - this.sessionData.startCoins;
        const totalAPProfit = this.sessionData.currentAP - this.sessionData.startAP;
        const sessionDuration = Date.now() - this.sessionData.startTime;
        const sessionHours = sessionDuration / (1000 * 60 * 60);

        return {
            totalCoinProfit,
            totalAPProfit,
            sessionDuration,
            sessionHours,
            coinsPerHour: sessionHours > 0 ? totalCoinProfit / sessionHours : 0,
            apPerHour: sessionHours > 0 ? totalAPProfit / sessionHours : 0,
            totalHarvests: this.sessionData.totalHarvests,
            totalPlants: this.sessionData.totalPlants,
            totalBoosters: this.sessionData.totalBoosters
        };
    }

    // Hitung profit per jam
    getHourlyProfit() {
        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000);
        
        const recentHistory = this.sessionData.profitHistory.filter(
            record => record.timestamp >= oneHourAgo
        );

        if (recentHistory.length < 2) {
            return { coinsPerHour: 0, apPerHour: 0, harvestsPerHour: 0 };
        }

        const firstRecord = recentHistory[0];
        const lastRecord = recentHistory[recentHistory.length - 1];
        
        const coinProfit = lastRecord.coins - firstRecord.coins;
        const apProfit = lastRecord.ap - firstRecord.ap;
        const timeDiff = (lastRecord.timestamp - firstRecord.timestamp) / (1000 * 60 * 60);

        const recentHarvests = this.sessionData.harvestHistory.filter(
            record => record.timestamp >= oneHourAgo
        ).reduce((sum, record) => sum + record.count, 0);

        return {
            coinsPerHour: timeDiff > 0 ? coinProfit / timeDiff : 0,
            apPerHour: timeDiff > 0 ? apProfit / timeDiff : 0,
            harvestsPerHour: timeDiff > 0 ? recentHarvests / timeDiff : 0
        };
    }

    // Hitung profit per hari
    getDailyProfit() {
        const now = Date.now();
        const oneDayAgo = now - (24 * 60 * 60 * 1000);
        
        const dailyHistory = this.sessionData.profitHistory.filter(
            record => record.timestamp >= oneDayAgo
        );

        if (dailyHistory.length < 2) {
            return { coinsPerDay: 0, apPerDay: 0, harvestsPerDay: 0 };
        }

        const firstRecord = dailyHistory[0];
        const lastRecord = dailyHistory[dailyHistory.length - 1];
        
        const coinProfit = lastRecord.coins - firstRecord.coins;
        const apProfit = lastRecord.ap - firstRecord.ap;
        const timeDiff = (lastRecord.timestamp - firstRecord.timestamp) / (1000 * 60 * 60 * 24);

        const dailyHarvests = this.sessionData.harvestHistory.filter(
            record => record.timestamp >= oneDayAgo
        ).reduce((sum, record) => sum + record.count, 0);

        return {
            coinsPerDay: timeDiff > 0 ? coinProfit / timeDiff : 0,
            apPerDay: timeDiff > 0 ? apProfit / timeDiff : 0,
            harvestsPerDay: timeDiff > 0 ? dailyHarvests / timeDiff : 0
        };
    }

    // Generate profit report
    generateReport() {
        const sessionProfit = this.getSessionProfit();
        const hourlyProfit = this.getHourlyProfit();
        const dailyProfit = this.getDailyProfit();

        return {
            session: sessionProfit,
            hourly: hourlyProfit,
            daily: dailyProfit,
            summary: {
                totalCoinProfit: sessionProfit.totalCoinProfit,
                totalAPProfit: sessionProfit.totalAPProfit,
                sessionHours: sessionProfit.sessionHours,
                coinsPerHour: sessionProfit.coinsPerHour,
                apPerHour: sessionProfit.apPerHour,
                totalHarvests: sessionProfit.totalHarvests,
                efficiency: sessionProfit.totalHarvests > 0 ? 
                    (sessionProfit.totalCoinProfit + sessionProfit.totalAPProfit) / sessionProfit.totalHarvests : 0
            }
        };
    }

    // Format profit untuk display
    formatProfit(profit) {
        return {
            coins: profit.toLocaleString('id-ID'),
            ap: profit.toLocaleString('id-ID'),
            coinsPerHour: profit.toLocaleString('id-ID', { maximumFractionDigits: 2 }),
            apPerHour: profit.toLocaleString('id-ID', { maximumFractionDigits: 2 })
        };
    }

    // Reset session data
    resetSession() {
        this.sessionData = {
            startTime: Date.now(),
            startCoins: this.sessionData.currentCoins,
            startAP: this.sessionData.currentAP,
            currentCoins: this.sessionData.currentCoins,
            currentAP: this.sessionData.currentAP,
            totalHarvests: 0,
            totalPlants: 0,
            totalBoosters: 0,
            harvestHistory: [],
            profitHistory: [],
            lastUpdate: Date.now()
        };
        this.saveData();
        logger.info('🔄 Profit tracking session reset');
    }
}

// Export singleton instance
export const profitTracker = new ProfitTracker();
