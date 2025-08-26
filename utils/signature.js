// =================================================================
// SIGNATURE UTILITY (Updated to match source)
// Berisi logika untuk membuat signature pada request mutation.
// Diperbarui untuk match dengan implementasi asli dari source code.
// =================================================================

/**
 * Secret key pattern dari source code asli
 */
function getSecretKey() {
    const keyParts = ["asasdads23232!eda", "3", "3ed@#@!@#Ffdf#@!", "4"];
    const pattern = [1, 1, 2, 1, 2]; // dari source: let d = [1, 1, 2, 1, 2]
    return pattern.map(index => keyParts[index]).join("");
}

/**
 * Header constants yang sesuai dengan source
 */
const HEADER_NAMES = {
    META_HASH: "x-xas3d",
    CLIENT_TIME: "x-mhab",
    TRACE_ID: "x-2sa3"
};

/**
 * Membuat HMAC signature menggunakan Web Crypto API (sama seperti source)
 */
async function createHmacSignature(secretKey, message) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secretKey);
    const messageData = encoder.encode(message);

    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);

    return Array.from(new Uint8Array(signature))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Generate random nonce (sama seperti source)
 */
function generateNonce() {
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    return Array.from(randomBytes)
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Membuat signature lengkap (sama seperti fungsi m() di source)
 */
async function generateSignature(inputPayload) {
    const timestamp = Date.now();
    const nonce = generateNonce();
    const payloadString = JSON.stringify(inputPayload);
    const message = `${timestamp}.${nonce}.${payloadString}`;

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
        const { signature, timestamp, nonce } = await generateSignature(payload);
        return {
            [HEADER_NAMES.META_HASH]: signature,
            [HEADER_NAMES.CLIENT_TIME]: timestamp.toString(),
            [HEADER_NAMES.TRACE_ID]: nonce,
        };
    } catch (error) {
        console.error('Failed to generate signature headers:', error);
        // Jika gagal, kembalikan objek kosong agar tidak menghentikan request
        return {};
    }
}