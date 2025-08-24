// =================================================================
// API SERVICE
// Mengelola semua komunikasi jaringan dengan server AppleVille.
// =================================================================

import { API_SETTINGS } from '../config.js';
import { logger } from '../utils/logger.js';
import { mutationHeaders } from '../utils/signature.js';
import * as payloads from './payloads.js';

// Error khusus untuk menandakan CAPTCHA diperlukan.
export class CaptchaError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CaptchaError';
    }
}

// Variabel global untuk menyimpan cookie, akan di-set saat inisialisasi.
let COOKIE = '';

/**
 * Mengatur cookie yang akan digunakan untuk semua request.
 * @param {string} cookieString - Cookie dari pengguna.
 */
export const setCookie = (cookieString) => {
    COOKIE = cookieString;
};

// --- FUNGSI JARINGAN DASAR ---

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url, options, retries = API_SETTINGS.MAX_RETRIES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 detik timeout

            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) {
                let errorBody = 'Could not read error body.';
                try {
                    errorBody = await response.text();
                } catch { }

                // Deteksi spesifik untuk error 421 (CAPTCHA)
                if (response.status === 412) {
                    throw new CaptchaError('Captcha required by server.');
                }

                throw new Error(`HTTP ${response.status}: ${response.statusText}. Response: ${errorBody}`);
            }
            return response;
        } catch (error) {
            // Jika error adalah CaptchaError, langsung lempar lagi tanpa mencoba ulang.
            if (error instanceof CaptchaError) {
                throw error;
            }
            logger.debug(`Fetch attempt ${attempt}/${retries} failed: ${error.message}`);
            if (attempt === retries) throw error;
            await sleep(API_SETTINGS.RETRY_DELAY * Math.pow(2, attempt - 1));
        }
    }
}

function parseTrpcResponse(text) {
    try {
        const json = JSON.parse(text);
        if (Array.isArray(json) && json.length > 0) return json[0];
        return json;
    } catch {
        throw new Error(`Invalid JSON response: ${text.slice(0, 200)}`);
    }
}

async function trpcPost(path, payload) {
    const url = `${API_SETTINGS.BASE_URL}/${path}?batch=1`;
    const sigPayload = payload?.[0]?.json ?? null;

    try {
        const headers = {
            'accept': 'application/json',
            'content-type': 'application/json',
            'cookie': COOKIE,
            'origin': 'https://app.appleville.xyz',
            'referer': 'https://app.appleville.xyz/',
            'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            ...(await mutationHeaders(sigPayload)),
        };

        const res = await fetchWithRetry(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        });

        const text = await res.text();
        logger.debug(`Response from ${path}: ${text}`);
        return parseTrpcResponse(text);
    } catch (error) {
        // Jika ini CaptchaError, lempar lagi agar bot bisa menangkapnya.
        if (error instanceof CaptchaError) {
            throw error;
        }
        logger.error(`trpcPost failed for ${path}: ${error.message}`);
        throw error;
    }
}

async function trpcGet(path) {
    const url = `${API_SETTINGS.BASE_URL}/${path}?batch=1`;
    try {
        const res = await fetchWithRetry(url, {
            method: 'GET',
            headers: { 'cookie': COOKIE, 'accept': 'application/json' },
        });
        const text = await res.text();
        return JSON.parse(text);
    } catch (error) {
        if (error instanceof CaptchaError) {
            throw error;
        }
        logger.error(`trpcGet failed for ${path}: ${error.message}`);
        throw error;
    }
}

// --- FUNGSI AKSI API ---

const handleApiResponse = (response) => {
    const error = response?.error?.json || response?.result?.error;
    if (error) {
        // Jangan log error di sini, biarkan pemanggil yang menangani
        return { ok: false, error };
    }
    const data = response?.result?.data?.json;
    return { ok: true, data };
};

export const api = {
    /** Mengambil status profil dan game. */
    getState: async () => {
        try {
            const data = await trpcGet('auth.me,core.getState');
            if (Array.isArray(data) && data.length >= 2) {
                return { ok: true, user: data[0]?.result?.data?.json, state: data[1]?.result?.data?.json };
            }
            return { ok: false, error: { message: 'Invalid state response' } };
        } catch (error) {
            // Lempar lagi error agar bisa ditangkap oleh bot.js
            throw error;
        }
    },

    /** Menanam satu bibit di satu slot. */
    plantSeed: async (slotIndex, seedKey) => {
        const response = await trpcPost('core.plantSeed', payloads.plantSeedPayload(slotIndex, seedKey));
        return handleApiResponse(response);
    },

    /** Memanen satu slot. */
    harvestSlot: async (slotIndex) => {
        const response = await trpcPost('core.harvest', payloads.harvestPayload(slotIndex));
        return handleApiResponse(response);
    },

    /** Memasang satu booster di satu slot. */
    applyModifier: async (slotIndex, modifierKey) => {
        const response = await trpcPost('core.applyModifier', payloads.applyModifierPayload(slotIndex, modifierKey));
        return handleApiResponse(response);
    },

    /** Membeli item. */
    buyItem: async (key, quantity) => {
        const response = await trpcPost('core.buyItem', payloads.buyItemPayload(key, quantity));
        return handleApiResponse(response);
    },
};
