// =================================================================
// SIGNATURE UTILITY
// Berisi logika untuk membuat signature pada request mutation.
// Kode ini tidak diubah dari source aslinya untuk menjaga validitas.
// =================================================================

import crypto from 'crypto';

const SECRET_KEY = "aspih0f7303f0248gh204429g24d9jah9dsg97h9!eda";

/**
 * Membuat signature HMAC-SHA256 berdasarkan payload.
 * @param {object | null} inputPayload - Payload JSON dari request.
 * @returns {Promise<{signature: string, timestamp: number, nonce: string}>}
 */
async function generateSignature(inputPayload) {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');
    const payloadString = JSON.stringify(inputPayload ?? {});
    const message = `${timestamp}.${nonce}.${payloadString}`;

    const signature = crypto
        .createHmac('sha256', SECRET_KEY)
        .update(message, 'utf8')
        .digest('hex');

    return { signature, timestamp, nonce };
}

/**
 * Menghasilkan header yang diperlukan untuk request mutation.
 * @param {object | null} payload - Payload JSON dari request.
 * @returns {Promise<object>} Objek berisi header signature.
 */
export async function mutationHeaders(payload) {
    try {
        const { signature, timestamp, nonce } = await generateSignature(payload);
        return {
            'x-meta-hash': signature,
            'x-client-time': String(timestamp),
            'x-trace-id': nonce,
        };
    } catch (error) {
        // Jika gagal, kembalikan objek kosong agar tidak menghentikan request
        return {};
    }
}
