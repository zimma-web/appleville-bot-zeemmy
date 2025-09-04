// =================================================================
// AUTO BACKUP - Sistem Backup Otomatis
// Backup konfigurasi dan data penting secara otomatis
// =================================================================

import { logger } from './logger.js';
import fs from 'fs';
import path from 'path';

export class AutoBackup {
    constructor() {
        this.backupDir = path.join(process.cwd(), 'backups');
        this.settings = {
            enabled: true,
            interval: 3600000, // 1 jam
            maxBackups: 24, // 24 backup terakhir
            backupFiles: [
                'config.js',
                'telegram-config.js',
                'profit-data.json',
                'performance-data.json',
                'daily-reports.json'
            ],
            compressBackups: true
        };
        this.lastBackupTime = 0;
        this.ensureBackupDir();
    }

    // Ensure backup directory exists
    ensureBackupDir() {
        try {
            if (!fs.existsSync(this.backupDir)) {
                fs.mkdirSync(this.backupDir, { recursive: true });
                logger.info('📁 Backup directory created');
            }
        } catch (error) {
            logger.error(`❌ Failed to create backup directory: ${error.message}`);
        }
    }

    // Set settings
    setSettings(settings) {
        this.settings = { ...this.settings, ...settings };
        logger.info('⚙️ Auto backup settings updated');
    }

    // Check if should backup
    shouldBackup() {
        if (!this.settings.enabled) return false;
        
        const now = Date.now();
        return now - this.lastBackupTime >= this.settings.interval;
    }

    // Create backup
    async createBackup() {
        try {
            if (!this.settings.enabled) {
                logger.debug('📁 Auto backup disabled');
                return null;
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = `backup-${timestamp}`;
            const backupPath = path.join(this.backupDir, backupName);

            // Create backup directory
            fs.mkdirSync(backupPath, { recursive: true });

            let backedUpFiles = 0;
            let failedFiles = 0;

            // Backup each file
            for (const file of this.settings.backupFiles) {
                try {
                    const sourcePath = path.join(process.cwd(), file);
                    const destPath = path.join(backupPath, file);

                    if (fs.existsSync(sourcePath)) {
                        fs.copyFileSync(sourcePath, destPath);
                        backedUpFiles++;
                        logger.debug(`📁 Backed up: ${file}`);
                    } else {
                        logger.debug(`📁 File not found: ${file}`);
                    }
                } catch (error) {
                    logger.warn(`❌ Failed to backup ${file}: ${error.message}`);
                    failedFiles++;
                }
            }

            // Create backup info
            const backupInfo = {
                timestamp: Date.now(),
                name: backupName,
                path: backupPath,
                files: {
                    backedUp: backedUpFiles,
                    failed: failedFiles,
                    total: this.settings.backupFiles.length
                },
                settings: this.settings
            };

            // Save backup info
            const infoPath = path.join(backupPath, 'backup-info.json');
            fs.writeFileSync(infoPath, JSON.stringify(backupInfo, null, 2));

            this.lastBackupTime = Date.now();
            this.cleanupOldBackups();

            logger.info(`📁 Backup created: ${backupName} (${backedUpFiles}/${this.settings.backupFiles.length} files)`);
            
            // Send Telegram notification
            const message = `💾 *AUTO BACKUP SUCCESS!* 💾

📁 *Backup Berhasil!*
• Backup Name: ${backupName}
• Files Backed Up: ${backedUpFiles}/${this.settings.backupFiles.length}
• Failed Files: ${failedFiles}
• Backup Path: ${backupPath}

📊 *Backup Info:*
• Total Backups: ${this.getBackupList().length}
• Max Backups: ${this.settings.maxBackups}
• Next Backup: ${new Date(this.lastBackupTime + this.settings.interval).toLocaleString('id-ID')}

⏰ *Waktu:* ${new Date().toLocaleString('id-ID')}`;

            // Import sendTelegramMessage dynamically to avoid circular dependency
            const { sendTelegramMessage } = await import('./telegram.js');
            await sendTelegramMessage(message);
            
            return backupInfo;

        } catch (error) {
            logger.error(`❌ Failed to create backup: ${error.message}`);
            return null;
        }
    }

    // Cleanup old backups
    cleanupOldBackups() {
        try {
            const backups = fs.readdirSync(this.backupDir)
                .filter(name => name.startsWith('backup-'))
                .map(name => {
                    const backupPath = path.join(this.backupDir, name);
                    const stats = fs.statSync(backupPath);
                    return { name, path: backupPath, mtime: stats.mtime };
                })
                .sort((a, b) => b.mtime - a.mtime);

            // Remove old backups
            if (backups.length > this.settings.maxBackups) {
                const toRemove = backups.slice(this.settings.maxBackups);
                for (const backup of toRemove) {
                    try {
                        fs.rmSync(backup.path, { recursive: true, force: true });
                        logger.debug(`🗑️ Removed old backup: ${backup.name}`);
                    } catch (error) {
                        logger.warn(`❌ Failed to remove backup ${backup.name}: ${error.message}`);
                    }
                }
            }

        } catch (error) {
            logger.error(`❌ Failed to cleanup old backups: ${error.message}`);
        }
    }

    // Get backup list
    getBackupList() {
        try {
            const backups = fs.readdirSync(this.backupDir)
                .filter(name => name.startsWith('backup-'))
                .map(name => {
                    const backupPath = path.join(this.backupDir, name);
                    const infoPath = path.join(backupPath, 'backup-info.json');
                    
                    if (fs.existsSync(infoPath)) {
                        try {
                            const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
                            return {
                                name: name,
                                timestamp: info.timestamp,
                                date: new Date(info.timestamp).toLocaleString('id-ID'),
                                files: info.files,
                                path: backupPath
                            };
                        } catch (error) {
                            logger.warn(`❌ Failed to read backup info for ${name}: ${error.message}`);
                        }
                    }
                    
                    // Fallback to file stats
                    const stats = fs.statSync(backupPath);
                    return {
                        name: name,
                        timestamp: stats.mtime.getTime(),
                        date: stats.mtime.toLocaleString('id-ID'),
                        files: { backedUp: 0, failed: 0, total: 0 },
                        path: backupPath
                    };
                })
                .sort((a, b) => b.timestamp - a.timestamp);

            return backups;
        } catch (error) {
            logger.error(`❌ Failed to get backup list: ${error.message}`);
            return [];
        }
    }

    // Restore backup
    async restoreBackup(backupName) {
        try {
            const backupPath = path.join(this.backupDir, backupName);
            if (!fs.existsSync(backupPath)) {
                throw new Error(`Backup not found: ${backupName}`);
            }

            const infoPath = path.join(backupPath, 'backup-info.json');
            if (!fs.existsSync(infoPath)) {
                throw new Error(`Backup info not found: ${backupName}`);
            }

            const backupInfo = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
            let restoredFiles = 0;
            let failedFiles = 0;

            // Restore each file
            for (const file of this.settings.backupFiles) {
                try {
                    const sourcePath = path.join(backupPath, file);
                    const destPath = path.join(process.cwd(), file);

                    if (fs.existsSync(sourcePath)) {
                        fs.copyFileSync(sourcePath, destPath);
                        restoredFiles++;
                        logger.info(`📁 Restored: ${file}`);
                    }
                } catch (error) {
                    logger.warn(`❌ Failed to restore ${file}: ${error.message}`);
                    failedFiles++;
                }
            }

            logger.info(`📁 Backup restored: ${backupName} (${restoredFiles}/${this.settings.backupFiles.length} files)`);
            return { restoredFiles, failedFiles, total: this.settings.backupFiles.length };

        } catch (error) {
            logger.error(`❌ Failed to restore backup: ${error.message}`);
            throw error;
        }
    }

    // Delete backup
    async deleteBackup(backupName) {
        try {
            const backupPath = path.join(this.backupDir, backupName);
            if (!fs.existsSync(backupPath)) {
                throw new Error(`Backup not found: ${backupName}`);
            }

            fs.rmSync(backupPath, { recursive: true, force: true });
            logger.info(`🗑️ Backup deleted: ${backupName}`);

        } catch (error) {
            logger.error(`❌ Failed to delete backup: ${error.message}`);
            throw error;
        }
    }

    // Get backup status
    getBackupStatus() {
        const backups = this.getBackupList();
        const lastBackup = backups.length > 0 ? backups[0] : null;
        const nextBackup = this.lastBackupTime + this.settings.interval;

        return {
            enabled: this.settings.enabled,
            interval: this.settings.interval,
            maxBackups: this.settings.maxBackups,
            lastBackup: lastBackup ? {
                name: lastBackup.name,
                date: lastBackup.date,
                files: lastBackup.files
            } : null,
            nextBackup: new Date(nextBackup).toLocaleString('id-ID'),
            totalBackups: backups.length,
            backupFiles: this.settings.backupFiles
        };
    }

    // Force backup
    async forceBackup() {
        logger.info('📁 Forcing backup...');
        return await this.createBackup();
    }

    // Set enabled
    setEnabled(enabled) {
        this.settings.enabled = enabled;
        logger.info(`📁 Auto backup ${enabled ? 'enabled' : 'disabled'}`);
    }
}

// Export singleton instance
export const autoBackup = new AutoBackup();
