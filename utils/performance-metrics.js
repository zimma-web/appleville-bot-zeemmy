// =================================================================
// PERFORMANCE METRICS - Sistem Tracking Performa Bot
// Mengukur efisiensi, kecepatan, dan performa farming
// =================================================================

import { logger } from './logger.js';
import fs from 'fs';
import path from 'path';

export class PerformanceMetrics {
    constructor() {
        this.dataFile = path.join(process.cwd(), 'performance-data.json');
        this.metrics = {
            batchCycles: [],
            harvestTimes: [],
            plantTimes: [],
            boosterTimes: [],
            errorCount: 0,
            successCount: 0,
            totalUptime: 0,
            startTime: Date.now(),
            lastUpdate: Date.now()
        };
        this.loadData();
    }

    // Load data dari file
    loadData() {
        try {
            if (fs.existsSync(this.dataFile)) {
                const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
                this.metrics = { ...this.metrics, ...data };
                logger.info('📊 Performance metrics loaded successfully');
            }
        } catch (error) {
            logger.warn(`Failed to load performance data: ${error.message}`);
        }
    }

    // Save data ke file
    saveData() {
        try {
            this.metrics.lastUpdate = Date.now();
            fs.writeFileSync(this.dataFile, JSON.stringify(this.metrics, null, 2));
        } catch (error) {
            logger.warn(`Failed to save performance data: ${error.message}`);
        }
    }

    // Record batch cycle performance
    recordBatchCycle(duration, harvestCount, plantCount, boosterCount, success = true) {
        const batchRecord = {
            timestamp: Date.now(),
            duration: duration,
            harvestCount: harvestCount,
            plantCount: plantCount,
            boosterCount: boosterCount,
            success: success,
            efficiency: success ? (harvestCount + plantCount + boosterCount) / duration : 0
        };

        this.metrics.batchCycles.push(batchRecord);
        
        if (success) {
            this.metrics.successCount++;
        } else {
            this.metrics.errorCount++;
        }

        // Keep only last 1000 records
        if (this.metrics.batchCycles.length > 1000) {
            this.metrics.batchCycles = this.metrics.batchCycles.slice(-1000);
        }

        this.saveData();
    }

    // Record harvest performance
    recordHarvest(duration, slotCount, success = true) {
        const harvestRecord = {
            timestamp: Date.now(),
            duration: duration,
            slotCount: slotCount,
            success: success,
            slotsPerSecond: success ? slotCount / (duration / 1000) : 0
        };

        this.metrics.harvestTimes.push(harvestRecord);

        // Keep only last 1000 records
        if (this.metrics.harvestTimes.length > 1000) {
            this.metrics.harvestTimes = this.metrics.harvestTimes.slice(-1000);
        }

        this.saveData();
    }

    // Record plant performance
    recordPlant(duration, slotCount, success = true) {
        const plantRecord = {
            timestamp: Date.now(),
            duration: duration,
            slotCount: slotCount,
            success: success,
            slotsPerSecond: success ? slotCount / (duration / 1000) : 0
        };

        this.metrics.plantTimes.push(plantRecord);

        // Keep only last 1000 records
        if (this.metrics.plantTimes.length > 1000) {
            this.metrics.plantTimes = this.metrics.plantTimes.slice(-1000);
        }

        this.saveData();
    }

    // Record booster performance
    recordBooster(duration, slotCount, success = true) {
        const boosterRecord = {
            timestamp: Date.now(),
            duration: duration,
            slotCount: slotCount,
            success: success,
            slotsPerSecond: success ? slotCount / (duration / 1000) : 0
        };

        this.metrics.boosterTimes.push(boosterRecord);

        // Keep only last 1000 records
        if (this.metrics.boosterTimes.length > 1000) {
            this.metrics.boosterTimes = this.metrics.boosterTimes.slice(-1000);
        }

        this.saveData();
    }

    // Hitung rata-rata performa
    calculateAverages() {
        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000);
        const oneDayAgo = now - (24 * 60 * 60 * 1000);

        // Filter data terbaru
        const recentBatches = this.metrics.batchCycles.filter(b => b.timestamp >= oneHourAgo);
        const recentHarvests = this.metrics.harvestTimes.filter(h => h.timestamp >= oneHourAgo);
        const recentPlants = this.metrics.plantTimes.filter(p => p.timestamp >= oneHourAgo);
        const recentBoosters = this.metrics.boosterTimes.filter(b => b.timestamp >= oneHourAgo);

        // Hitung rata-rata
        const avgBatchDuration = recentBatches.length > 0 ? 
            recentBatches.reduce((sum, b) => sum + b.duration, 0) / recentBatches.length : 0;

        const avgHarvestSpeed = recentHarvests.length > 0 ? 
            recentHarvests.reduce((sum, h) => sum + h.slotsPerSecond, 0) / recentHarvests.length : 0;

        const avgPlantSpeed = recentPlants.length > 0 ? 
            recentPlants.reduce((sum, p) => sum + p.slotsPerSecond, 0) / recentPlants.length : 0;

        const avgBoosterSpeed = recentBoosters.length > 0 ? 
            recentBoosters.reduce((sum, b) => sum + b.slotsPerSecond, 0) / recentBoosters.length : 0;

        // Hitung success rate
        const totalOperations = this.metrics.successCount + this.metrics.errorCount;
        const successRate = totalOperations > 0 ? (this.metrics.successCount / totalOperations) * 100 : 100;

        // Hitung uptime
        const totalUptime = now - this.metrics.startTime;
        const uptimeHours = totalUptime / (1000 * 60 * 60);

        return {
            batch: {
                avgDuration: avgBatchDuration,
                totalCycles: this.metrics.batchCycles.length,
                recentCycles: recentBatches.length
            },
            harvest: {
                avgSpeed: avgHarvestSpeed,
                totalHarvests: this.metrics.harvestTimes.length,
                recentHarvests: recentHarvests.length
            },
            plant: {
                avgSpeed: avgPlantSpeed,
                totalPlants: this.metrics.plantTimes.length,
                recentPlants: recentPlants.length
            },
            booster: {
                avgSpeed: avgBoosterSpeed,
                totalBoosters: this.metrics.boosterTimes.length,
                recentBoosters: recentBoosters.length
            },
            overall: {
                successRate: successRate,
                totalUptime: totalUptime,
                uptimeHours: uptimeHours,
                operationsPerHour: uptimeHours > 0 ? totalOperations / uptimeHours : 0
            }
        };
    }

    // Generate performance report
    generateReport() {
        const averages = this.calculateAverages();
        
        return {
            summary: {
                uptime: this.formatUptime(averages.overall.uptimeHours),
                successRate: `${averages.overall.successRate.toFixed(2)}%`,
                operationsPerHour: averages.overall.operationsPerHour.toFixed(2),
                totalOperations: this.metrics.successCount + this.metrics.errorCount
            },
            performance: {
                batchDuration: `${averages.batch.avgDuration.toFixed(0)}ms`,
                harvestSpeed: `${averages.harvest.avgSpeed.toFixed(2)} slots/sec`,
                plantSpeed: `${averages.plant.avgSpeed.toFixed(2)} slots/sec`,
                boosterSpeed: `${averages.booster.avgSpeed.toFixed(2)} slots/sec`
            },
            activity: {
                totalBatches: averages.batch.totalCycles,
                totalHarvests: averages.harvest.totalHarvests,
                totalPlants: averages.plant.totalPlants,
                totalBoosters: averages.booster.totalBoosters
            },
            recent: {
                recentBatches: averages.batch.recentCycles,
                recentHarvests: averages.harvest.recentHarvests,
                recentPlants: averages.plant.recentPlants,
                recentBoosters: averages.booster.recentBoosters
            }
        };
    }

    // Format uptime
    formatUptime(hours) {
        if (hours < 1) {
            const minutes = Math.floor(hours * 60);
            return `${minutes}m`;
        } else if (hours < 24) {
            const h = Math.floor(hours);
            const m = Math.floor((hours - h) * 60);
            return `${h}h ${m}m`;
        } else {
            const days = Math.floor(hours / 24);
            const h = Math.floor(hours % 24);
            return `${days}d ${h}h`;
        }
    }

    // Get performance score (0-100)
    getPerformanceScore() {
        const averages = this.calculateAverages();
        
        // Hitung score berdasarkan berbagai faktor
        const successScore = averages.overall.successRate;
        const speedScore = Math.min(100, (averages.harvest.avgSpeed + averages.plant.avgSpeed) * 10);
        const uptimeScore = Math.min(100, averages.overall.uptimeHours * 2);
        const efficiencyScore = averages.batch.avgDuration > 0 ? 
            Math.max(0, 100 - (averages.batch.avgDuration / 100)) : 100;

        const totalScore = (successScore + speedScore + uptimeScore + efficiencyScore) / 4;
        return Math.round(totalScore);
    }

    // Reset metrics
    resetMetrics() {
        this.metrics = {
            batchCycles: [],
            harvestTimes: [],
            plantTimes: [],
            boosterTimes: [],
            errorCount: 0,
            successCount: 0,
            totalUptime: 0,
            startTime: Date.now(),
            lastUpdate: Date.now()
        };
        this.saveData();
        logger.info('🔄 Performance metrics reset');
    }
}

// Export singleton instance
export const performanceMetrics = new PerformanceMetrics();
