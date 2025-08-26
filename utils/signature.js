// =================================================================
// SIGNATURE UTILITY
// File ini menggunakan konfigurasi dari signature-config.js
// Hanya perlu di-update jika ada perubahan algoritma, bukan konfigurasi.
// =================================================================

import { webcrypto } from 'crypto';
import { logger } from './logger.js';
import { SIGNATURE_PATTERN, KEY_PARTS, HEADER_NAMES } from './signature-config.js';

/**
 * Secret key pattern dari source code asli
 */
function getSecretKey() {
    const secretKey = SIGNATURE_PATTERN.map(index => KEY_PARTS[index]).join("");
    logger.debug(`Secret key generated: ${secretKey}`);
    return secretKey;
}

/**
 * Membuat HMAC signature menggunakan Web Crypto API (sama seperti source)
 */
async function createHmacSignature(secretKey, message) {
    logger.debug(`Creating signature for message: ${message}`);

    const encoder = new TextEncoder();
    const keyData = encoder.encode(secretKey);
    const messageData = encoder.encode(message);

    const cryptoKey = await webcrypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const signature = await webcrypto.subtle.sign("HMAC", cryptoKey, messageData);

    const signatureHex = Array.from(new Uint8Array(signature))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");

    logger.debug(`Signature generated: ${signatureHex}`);
    return signatureHex;
}

/**
 * Generate random nonce (sama seperti source)
 */
function generateNonce() {
    const randomBytes = new Uint8Array(16);
    webcrypto.getRandomValues(randomBytes);
    const nonce = Array.from(randomBytes)
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
    logger.debug(`Nonce generated: ${nonce}`);
    return nonce;
}

/**
 * Membuat signature lengkap (sama seperti fungsi m() di source)
 */
async function generateSignature(inputPayload) {
    const timestamp = Date.now();
    const nonce = generateNonce();
    const payloadString = JSON.stringify(inputPayload ?? null);
    const message = `${timestamp}.${nonce}.${payloadString}`;

    logger.debug(`Timestamp: ${timestamp}`);
    logger.debug(`Payload string: ${payloadString}`);
    logger.debug(`Full message: ${message}`);

    const secretKey = getSecretKey();
    const signature = await createHmacSignature(secretKey, message);

    return { signature, timestamp, nonce };
}

/**
 * Menghasilkan header yang diperlukan untuk request mutation.
 * @param {object | null} payload - Payload JSON dari request.
 * @returns {Promise<object>} Objek berisi header signature.
 */
export async function mutationHeaders(payload) {
    try {
        logger.debug(`mutationHeaders called with payload: ${JSON.stringify(payload)}`);

        const { signature, timestamp, nonce } = await generateSignature(payload);

        const headers = {
            [HEADER_NAMES.META_HASH]: signature,
            [HEADER_NAMES.CLIENT_TIME]: timestamp.toString(),
            [HEADER_NAMES.TRACE_ID]: nonce,
        };

        logger.debug(`Headers generated: ${JSON.stringify(headers)}`);
        logger.debug(`Header names used: ${JSON.stringify(HEADER_NAMES)}`);

        return headers;
    } catch (error) {
        logger.error('[ERROR] Failed to generate signature headers:', error);
        // Jika gagal, kembalikan objek kosong agar tidak menghentikan request
        return {};
    }
}

/**
 * Test function untuk debugging
 */
export async function testSignature() {
    logger.info("[TEST] Testing signature generation...");

    const testPayload = { test: "data" };
    const headers = await mutationHeaders(testPayload);

    logger.info(`[TEST] Test completed. Headers: ${JSON.stringify(headers)}`);
    logger.info(`[TEST] Expected header names: ${JSON.stringify(Object.values(HEADER_NAMES))}`);

    return headers;
}