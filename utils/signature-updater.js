// =================================================================
// SIGNATURE UPDATER MODULE - FIXED VERSION
// =================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_URL = 'https://app.appleville.xyz';
const SEARCH_PATTERN = /47121:\s*\([^)]*\)\s*=>/;

// --- FUNGSI EKSTRAKSI (diperbaiki) ---

function extractPattern(content) {
    // Lebih spesifik untuk menangkap array d
    const match = content.match(/let\s+d\s*=\s*\[([0-9,\s]+)\]/);
    if (match) {
        const numbers = match[1].split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
        logger.debug(`Pattern ditemukan: [${numbers.join(', ')}]`);
        return numbers;
    }

    // Pattern alternatif
    const altMatch = content.match(/d\s*=\s*\[([0-9,\s]+)\]/);
    if (altMatch) {
        const numbers = altMatch[1].split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
        logger.debug(`Pattern alternatif ditemukan: [${numbers.join(', ')}]`);
        return numbers;
    }

    logger.warn('Pattern tidak ditemukan dalam content');
    return null;
}

function extractKeyParts(content) {
    // Mencari deklarasi array e dengan string values
    const match = content.match(/let\s+e\s*=\s*\[([^\]]+)\]/);
    if (match) {
        const keyStr = match[1];
        // Ekstrak semua string dalam quotes
        const keyParts = [...keyStr.matchAll(/"([^"]*)"/g)].map(match => match[1]);
        if (keyParts.length >= 4) {
            logger.debug(`Key parts ditemukan: ${keyParts.length} items`);
            return keyParts;
        }
    }

    // Pattern alternatif untuk mencari array dengan string
    const altMatch = content.match(/\[\s*"([^"]*)",\s*"([^"]*)",\s*"([^"]*)",\s*"([^"]*)"\s*\]/);
    if (altMatch) {
        const keyParts = [altMatch[1], altMatch[2], altMatch[3], altMatch[4]];
        logger.debug(`Key parts alternatif ditemukan: ${keyParts.length} items`);
        return keyParts;
    }

    logger.warn('Key parts tidak ditemukan dalam content');
    return null;
}

function extractHeaders(content) {
    // Pattern utama: let u = { ... }
    const objectPattern = /let\s+u\s*=\s*\{\s*(\w+):\s*"([^"]+)",\s*(\w+):\s*"([^"]+)",\s*(\w+):\s*"([^"]+)"\s*\}/;
    const objectMatch = content.match(objectPattern);

    if (objectMatch) {
        const [, key1, val1, key2, val2, key3, val3] = objectMatch;
        const headers = {
            [key1]: val1,
            [key2]: val2,
            [key3]: val3
        };
        logger.debug(`Headers ditemukan: ${Object.keys(headers).join(', ')}`);
        return headers;
    }

    // Pattern alternatif: = { ... } tanpa deklarasi let
    const simpleObjectPattern = /=\s*\{\s*(\w+):\s*"([^"]+)",\s*(\w+):\s*"([^"]+)",\s*(\w+):\s*"([^"]+)"\s*\}/;
    const simpleObjectMatch = content.match(simpleObjectPattern);

    if (simpleObjectMatch) {
        const [, key1, val1, key2, val2, key3, val3] = simpleObjectMatch;
        const headers = {
            [key1]: val1,
            [key2]: val2,
            [key3]: val3
        };
        logger.debug(`Headers alternatif ditemukan: ${Object.keys(headers).join(', ')}`);
        return headers;
    }

    // Pattern fleksibel dengan whitespace berbeda
    const flexiblePattern = /\{\s*(\w+)\s*:\s*"([^"]+)"\s*,\s*(\w+)\s*:\s*"([^"]+)"\s*,\s*(\w+)\s*:\s*"([^"]+)"\s*\}/;
    const flexibleMatch = content.match(flexiblePattern);

    if (flexibleMatch) {
        const [, key1, val1, key2, val2, key3, val3] = flexibleMatch;
        const headers = {
            [key1]: val1,
            [key2]: val2,
            [key3]: val3
        };
        logger.debug(`Headers fleksibel ditemukan: ${Object.keys(headers).join(', ')}`);
        return headers;
    }

    logger.warn('Headers tidak ditemukan dalam content');
    return null;
}

function generateConfig(pattern, keyParts, headers) {
    const headerKeys = Object.keys(headers);

    return `// =================================================================
// SIGNATURE CONFIG
// Generated at: ${new Date().toISOString()}
// Source: Appleville Signature Updater
// =================================================================

export const SIGNATURE_PATTERN = ${JSON.stringify(pattern)};
export const KEY_PARTS = ${JSON.stringify(keyParts)};
export const HEADER_NAMES = {
    ${headerKeys.map(key => `${key}: "${headers[key]}"`).join(',\n    ')}
};

// Debug info (comment out in production)
/*
Pattern: ${JSON.stringify(pattern)}
Key Parts: ${JSON.stringify(keyParts)}
Headers: ${JSON.stringify(headers)}
Generated secret preview: ${pattern.map(index => keyParts[index] || `[MISSING-${index}]`).join('')}
*/`;
}

/**
 * Menjalankan proses untuk mengambil dan memperbarui signature config.
 */
export async function updateSignature() {
    logger.info('🚀 Memulai proses pembaruan signature...');
    logger.info(`📡 Mengambil data dari ${TARGET_URL}...`);

    try {
        const response = await fetch(TARGET_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`Gagal mengambil HTML: HTTP ${response.status} ${response.statusText}`);
        }

        const html = await response.text();
        logger.success('✅ HTML berhasil diunduh.');

        const scriptRegex = /src="([^"]+\.js)"/g;
        const scriptPaths = [...html.matchAll(scriptRegex)].map(match => match[1]);
        const chunkScripts = scriptPaths.filter(path =>
            path.includes('/_next/static/chunks/') &&
            !path.includes('webpack') &&
            !path.includes('framework')
        );

        if (chunkScripts.length === 0) {
            throw new Error('Tidak ada file chunk JavaScript yang ditemukan di HTML.');
        }

        logger.info(`🔍 Menemukan ${chunkScripts.length} file chunk untuk dipindai...`);

        for (const scriptPath of chunkScripts) {
            const scriptUrl = new URL(scriptPath, TARGET_URL).href;
            logger.debug(`📄 Memindai: ${scriptPath}`);

            try {
                const scriptResponse = await fetch(scriptUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                if (!scriptResponse.ok) {
                    logger.debug(`⚠️ Gagal mengunduh ${scriptPath}: HTTP ${scriptResponse.status}`);
                    continue;
                }

                const content = await scriptResponse.text();

                if (SEARCH_PATTERN.test(content)) {
                    logger.success(`🎯 Modul signature ditemukan di: ${scriptPath}`);

                    const pattern = extractPattern(content);
                    const keyParts = extractKeyParts(content);
                    const headers = extractHeaders(content);

                    // Logging hasil ekstraksi
                    logger.info('📊 Hasil Ekstraksi:');
                    logger.info(`  - Pattern: ${pattern ? `[${pattern.join(', ')}]` : '❌ TIDAK DITEMUKAN'}`);
                    logger.info(`  - KeyParts: ${keyParts ? `${keyParts.length} items` : '❌ TIDAK DITEMUKAN'}`);
                    logger.info(`  - Headers: ${headers ? `${Object.keys(headers).join(', ')}` : '❌ TIDAK DITEMUKAN'}`);

                    if (pattern && keyParts && headers) {
                        // Validasi pattern indices tidak melebihi keyParts length
                        const validPattern = pattern.every(index => index < keyParts.length);
                        if (!validPattern) {
                            logger.error('❌ Pattern indices melebihi panjang keyParts');
                            throw new Error('Pattern tidak valid');
                        }

                        const configContent = generateConfig(pattern, keyParts, headers);
                        const configPath = path.join(__dirname, 'signature-config.js');

                        fs.writeFileSync(configPath, configContent, 'utf8');
                        logger.success(`💾 Konfigurasi signature berhasil disimpan ke: ${configPath}`);

                        // Preview secret key yang akan dihasilkan
                        const previewSecret = pattern.map(index => keyParts[index]).join('');
                        logger.debug(`🔑 Preview secret key: ${previewSecret.substring(0, 20)}...`);

                        return true;
                    } else {
                        // Simpan file untuk debugging
                        const debugPath = path.join(__dirname, 'debug-chunk.js');
                        fs.writeFileSync(debugPath, content, 'utf8');
                        logger.warn(`⚠️ Gagal mengekstrak semua data. File debug disimpan: ${debugPath}`);
                    }
                }
            } catch (error) {
                logger.warn(`⚠️ Gagal memindai ${scriptPath}: ${error.message}`);
            }
        }

        throw new Error('Gagal mengekstrak data signature dari semua file chunk.');

    } catch (error) {
        logger.error(`❌ Update signature gagal: ${error.message}`);
        throw error;
    }
}