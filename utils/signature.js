// =================================================================
// DEBUG SIGNATURE UTILITY
// Tambahan logging untuk debug masalah header
// =================================================================

import { webcrypto } from 'crypto';
import { logger } from './logger.js'; // [DIUBAH] Impor logger

/**
 * Secret key pattern dari source code asli (UPDATED)
 */
function getSecretKey() {
    const keyParts = ["bbsds!eda", "2", "3ed2@#@!@#Ffdf#@!", "4"];
    const pattern = [2, 1, 0, 2, 1, 2]; // dari source: let d = [2, 1, 0, 2, 1, 2]
    const secretKey = pattern.map(index => keyParts[index]).join("");
    logger.debug(`Secret key generated: ${secretKey}`); // [DIUBAH] Menggunakan logger.debug
    return secretKey;
}

/**
 * Header constants yang sesuai dengan source (UPDATED)
 */
const HEADER_NAMES = {
    META_HASH: "x-xcsa3d",
    CLIENT_TIME: "x-dbsv",
    TRACE_ID: "x-dsa"
};

/**
 * Membuat HMAC signature menggunakan Web Crypto API (sama seperti source)
 */
async function createHmacSignature(secretKey, message) {
    logger.debug(`Creating signature for message: ${message}`); // [DIUBAH] Menggunakan logger.debug

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

    logger.debug(`Signature generated: ${signatureHex}`); // [DIUBAH] Menggunakan logger.debug
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
    logger.debug(`Nonce generated: ${nonce}`); // [DIUBAH] Menggunakan logger.debug
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
        console.error('[ERROR] Failed to generate signature headers:', error);
        // Jika gagal, kembalikan objek kosong agar tidak menghentikan request
        return {};
    }
}

// Tambahan: Test function untuk debugging
export async function testSignature() {
    logger.info("[TEST] Testing signature generation...");

    const testPayload = { test: "data" };
    const headers = await mutationHeaders(testPayload);

    logger.info(`[TEST] Test completed. Headers: ${JSON.stringify(headers)}`);
    logger.info(`[TEST] Expected header names: ${JSON.stringify(Object.values(HEADER_NAMES))}`);

    return headers;
}
