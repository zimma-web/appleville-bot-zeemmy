// =================================================================
// AI OPTIMIZATION - Sistem Optimasi Cerdas
// Machine learning untuk optimasi strategy farming
// =================================================================

import { logger } from './logger.js';
import { profitTracker } from './profit-tracker.js';
import { performanceMetrics } from './performance-metrics.js';
import { sendTelegramMessage } from './telegram.js';
import fs from 'fs';
import path from 'path';

export class AIOptimization {
    constructor() {
        this.dataFile = path.join(process.cwd(), 'ai-optimization-data.json');
        this.settings = {
            enabled: true,
            learningRate: 0.1,
            minDataPoints: 50,
            optimizationInterval: 1800000, // 30 menit
            autoApply: false // Set to true untuk auto apply optimizations
        };
        this.learningData = {
            strategies: [],
            performance: [],
            recommendations: []
        };
        this.lastOptimization = 0;
        this.loadData();
    }

    // Load learning data
    loadData() {
        try {
            if (fs.existsSync(this.dataFile)) {
                const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
                this.learningData = { ...this.learningData, ...data };
                logger.info('🤖 AI optimization data loaded successfully');
            }
        } catch (error) {
            logger.warn(`Failed to load AI optimization data: ${error.message}`);
        }
    }

    // Save learning data
    saveData() {
        try {
            fs.writeFileSync(this.dataFile, JSON.stringify(this.learningData, null, 2));
        } catch (error) {
            logger.warn(`Failed to save AI optimization data: ${error.message}`);
        }
    }

    // Record strategy performance
    recordStrategyPerformance(strategy, performance) {
        const record = {
            timestamp: Date.now(),
            strategy: strategy,
            performance: performance,
            profit: performance.profit || 0,
            efficiency: performance.efficiency || 0,
            successRate: performance.successRate || 0
        };

        this.learningData.strategies.push(record);

        // Keep only last 1000 records
        if (this.learningData.strategies.length > 1000) {
            this.learningData.strategies = this.learningData.strategies.slice(-1000);
        }

        this.saveData();
    }

    // Analyze performance patterns
    analyzePerformance() {
        if (this.learningData.strategies.length < this.settings.minDataPoints) {
            logger.debug('🤖 Insufficient data for AI analysis');
            return null;
        }

        const recentData = this.learningData.strategies.slice(-100); // Last 100 records
        const analysis = {
            bestStrategies: this.findBestStrategies(recentData),
            performanceTrends: this.analyzeTrends(recentData),
            recommendations: this.generateRecommendations(recentData),
            confidence: this.calculateConfidence(recentData)
        };

        return analysis;
    }

    // Find best performing strategies
    findBestStrategies(data) {
        const strategyGroups = {};
        
        // Group by strategy
        data.forEach(record => {
            const key = JSON.stringify(record.strategy);
            if (!strategyGroups[key]) {
                strategyGroups[key] = [];
            }
            strategyGroups[key].push(record);
        });

        // Calculate average performance for each strategy
        const strategyPerformance = Object.entries(strategyGroups).map(([key, records]) => {
            const avgProfit = records.reduce((sum, r) => sum + r.profit, 0) / records.length;
            const avgEfficiency = records.reduce((sum, r) => sum + r.efficiency, 0) / records.length;
            const avgSuccessRate = records.reduce((sum, r) => sum + r.successRate, 0) / records.length;
            const count = records.length;

            return {
                strategy: JSON.parse(key),
                avgProfit,
                avgEfficiency,
                avgSuccessRate,
                count,
                score: (avgProfit * 0.4) + (avgEfficiency * 0.3) + (avgSuccessRate * 0.3)
            };
        });

        // Sort by score
        return strategyPerformance.sort((a, b) => b.score - a.score).slice(0, 5);
    }

    // Analyze performance trends
    analyzeTrends(data) {
        if (data.length < 10) return null;

        const recent = data.slice(-10);
        const older = data.slice(-20, -10);

        const recentAvg = {
            profit: recent.reduce((sum, r) => sum + r.profit, 0) / recent.length,
            efficiency: recent.reduce((sum, r) => sum + r.efficiency, 0) / recent.length,
            successRate: recent.reduce((sum, r) => sum + r.successRate, 0) / recent.length
        };

        const olderAvg = {
            profit: older.reduce((sum, r) => sum + r.profit, 0) / older.length,
            efficiency: older.reduce((sum, r) => sum + r.efficiency, 0) / older.length,
            successRate: older.reduce((sum, r) => sum + r.successRate, 0) / older.length
        };

        return {
            profit: {
                current: recentAvg.profit,
                previous: olderAvg.profit,
                change: ((recentAvg.profit - olderAvg.profit) / olderAvg.profit) * 100
            },
            efficiency: {
                current: recentAvg.efficiency,
                previous: olderAvg.efficiency,
                change: ((recentAvg.efficiency - olderAvg.efficiency) / olderAvg.efficiency) * 100
            },
            successRate: {
                current: recentAvg.successRate,
                previous: olderAvg.successRate,
                change: ((recentAvg.successRate - olderAvg.successRate) / olderAvg.successRate) * 100
            }
        };
    }

    // Generate recommendations
    generateRecommendations(data) {
        const recommendations = [];
        const analysis = this.analyzePerformance();

        if (!analysis) return recommendations;

        // Performance trend recommendations
        if (analysis.performanceTrends) {
            const trends = analysis.performanceTrends;
            
            if (trends.profit.change < -10) {
                recommendations.push({
                    type: 'profit_decline',
                    priority: 'high',
                    message: 'Profit menurun, pertimbangkan ganti strategy',
                    action: 'change_strategy'
                });
            }

            if (trends.efficiency.change < -10) {
                recommendations.push({
                    type: 'efficiency_decline',
                    priority: 'medium',
                    message: 'Efisiensi menurun, periksa delay settings',
                    action: 'optimize_delays'
                });
            }

            if (trends.successRate.change < -5) {
                recommendations.push({
                    type: 'success_rate_decline',
                    priority: 'high',
                    message: 'Success rate menurun, periksa koneksi',
                    action: 'check_connection'
                });
            }
        }

        // Best strategy recommendations
        if (analysis.bestStrategies.length > 0) {
            const bestStrategy = analysis.bestStrategies[0];
            recommendations.push({
                type: 'best_strategy',
                priority: 'medium',
                message: `Strategy terbaik: ${bestStrategy.strategy.seedKey} + ${bestStrategy.strategy.boosterKey}`,
                action: 'apply_strategy',
                strategy: bestStrategy.strategy
            });
        }

        return recommendations;
    }

    // Calculate confidence score
    calculateConfidence(data) {
        if (data.length < 10) return 0;

        const recent = data.slice(-10);
        const profitVariance = this.calculateVariance(recent.map(r => r.profit));
        const efficiencyVariance = this.calculateVariance(recent.map(r => r.efficiency));
        const successRateVariance = this.calculateVariance(recent.map(r => r.successRate));

        // Lower variance = higher confidence
        const avgVariance = (profitVariance + efficiencyVariance + successRateVariance) / 3;
        const confidence = Math.max(0, 100 - (avgVariance * 10));

        return Math.round(confidence);
    }

    // Calculate variance
    calculateVariance(values) {
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        return variance;
    }

    // Run optimization
    async runOptimization() {
        if (!this.settings.enabled) return null;

        const now = Date.now();
        if (now - this.lastOptimization < this.settings.optimizationInterval) {
            return null;
        }

        this.lastOptimization = now;

        try {
            // Get current performance data
            const profitData = profitTracker.generateReport();
            const performanceData = performanceMetrics.generateReport();

            // Record current strategy performance
            const currentStrategy = {
                seedKey: 'current', // This should be passed from bot config
                boosterKey: 'current',
                batchSize: 12,
                delays: {
                    batch: 50,
                    harvest: 25,
                    plant: 25,
                    booster: 25
                }
            };

            const currentPerformance = {
                profit: profitData.summary.totalCoinProfit,
                efficiency: profitData.summary.efficiency,
                successRate: parseFloat(performanceData.summary.successRate.replace('%', ''))
            };

            this.recordStrategyPerformance(currentStrategy, currentPerformance);

            // Analyze performance
            const analysis = this.analyzePerformance();
            if (!analysis) return null;

            // Generate recommendations
            const recommendations = this.generateRecommendations(this.learningData.strategies);
            
            // Store recommendations
            this.learningData.recommendations.push({
                timestamp: now,
                analysis: analysis,
                recommendations: recommendations,
                confidence: analysis.confidence
            });

            // Keep only last 100 recommendations
            if (this.learningData.recommendations.length > 100) {
                this.learningData.recommendations = this.learningData.recommendations.slice(-100);
            }

            this.saveData();

            // Send optimization report if confidence is high
            if (analysis.confidence > 70) {
                await this.sendOptimizationReport(analysis, recommendations);
            } else if (analysis.confidence > 50) {
                // Send simplified report for medium confidence
                await this.sendSimplifiedOptimizationReport(analysis, recommendations);
            }

            logger.info(`🤖 AI optimization completed (confidence: ${analysis.confidence}%)`);
            return { analysis, recommendations };

        } catch (error) {
            logger.error(`❌ AI optimization error: ${error.message}`);
            return null;
        }
    }

    // Send optimization report
    async sendOptimizationReport(analysis, recommendations) {
        try {
            let message = `🤖 *AI OPTIMIZATION REPORT* 🤖

📊 *Analysis Summary*
• Confidence: ${analysis.confidence}%
• Data Points: ${this.learningData.strategies.length}
• Best Strategy Score: ${analysis.bestStrategies[0]?.score.toFixed(2) || 'N/A'}

📈 *Performance Trends*`;

            if (analysis.performanceTrends) {
                const trends = analysis.performanceTrends;
                message += `
• Profit: ${trends.profit.change > 0 ? '📈' : '📉'} ${trends.profit.change.toFixed(2)}%
• Efficiency: ${trends.efficiency.change > 0 ? '📈' : '📉'} ${trends.efficiency.change.toFixed(2)}%
• Success Rate: ${trends.successRate.change > 0 ? '📈' : '📉'} ${trends.successRate.change.toFixed(2)}%`;
            }

            if (recommendations.length > 0) {
                message += `\n\n💡 *Recommendations*`;
                recommendations.forEach((rec, index) => {
                    const priority = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
                    message += `\n${index + 1}. ${priority} ${rec.message}`;
                });
            }

            message += `\n\n⏰ *Generated:* ${new Date().toLocaleString('id-ID')}`;

            await sendTelegramMessage(message);
            logger.info('🤖 AI optimization report sent');

        } catch (error) {
            logger.error(`❌ Failed to send AI optimization report: ${error.message}`);
        }
    }

    // Send simplified optimization report
    async sendSimplifiedOptimizationReport(analysis, recommendations) {
        try {
            let message = `🤖 *AI OPTIMIZATION UPDATE* 🤖

📊 *Quick Analysis*
• Confidence: ${analysis.confidence}%
• Data Points: ${this.learningData.strategies.length}
• Best Strategy Score: ${analysis.bestStrategies[0]?.score.toFixed(2) || 'N/A'}`;

            if (recommendations.length > 0) {
                message += `\n\n💡 *Top Recommendations*`;
                recommendations.slice(0, 3).forEach((rec, index) => {
                    const priority = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
                    message += `\n${index + 1}. ${priority} ${rec.message}`;
                });
            }

            message += `\n\n⏰ *Generated:* ${new Date().toLocaleString('id-ID')}`;

            await sendTelegramMessage(message);
            logger.info('🤖 AI optimization update sent');

        } catch (error) {
            logger.error(`❌ Failed to send AI optimization update: ${error.message}`);
        }
    }

    // Get optimization status
    getOptimizationStatus() {
        return {
            enabled: this.settings.enabled,
            dataPoints: this.learningData.strategies.length,
            lastOptimization: this.lastOptimization ? new Date(this.lastOptimization).toLocaleString('id-ID') : 'Never',
            nextOptimization: new Date(this.lastOptimization + this.settings.optimizationInterval).toLocaleString('id-ID'),
            confidence: this.calculateConfidence(this.learningData.strategies),
            recommendations: this.learningData.recommendations.slice(-5)
        };
    }

    // Set enabled
    setEnabled(enabled) {
        this.settings.enabled = enabled;
        logger.info(`🤖 AI optimization ${enabled ? 'enabled' : 'disabled'}`);
    }
}

// Export singleton instance
export const aiOptimization = new AIOptimization();
