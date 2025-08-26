// =================================================================
// API SERVICE
// Mengelola semua komunikasi jaringan dengan server AppleVille.
// =================================================================

import { API_SETTINGS } from '../config.js';
import { logger } from '../utils/logger.js';
import { mutationHeaders } from '../utils/signature.js';
import * as payloads from './payloads.js';

// Error khusus
export class CaptchaError extends Error {
    constructor(message) { super(message); this.name = 'CaptchaError'; }
}
export class SignatureError extends Error {
    constructor(message) { super(message); this.name = 'SignatureError'; }
}

let COOKIE = '';

export const setCookie = (cookieString) => {
    COOKIE = cookieString;
};

// --- FUNGSI JARINGAN DASAR ---

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url, options, retries = API_SETTINGS.MAX_RETRIES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) {
                let errorBody = 'Could not read error body.';
                try { errorBody = await response.text(); } catch { }

                if (response.status === 421 || response.status === 412) {
                    throw new CaptchaError('Captcha required by server.');
                }

                // [DIUBAH] Deteksi error signature yang lebih spesifik
                if (response.status === 401 && errorBody.includes('SUSPICIOUS REQUEST DETECTED')) {
                    throw new SignatureError('Suspicious request detected (likely invalid signature).');
                }

                if (errorBody.includes('Invalid request signature') || errorBody.includes('Missing signature')) {
                    throw new SignatureError('Signature error: ' + errorBody);
                }

                throw new Error(`HTTP ${response.status}: ${response.statusText}. Response: ${errorBody}`);
            }
            return response;
        } catch (error) {
            if (error instanceof CaptchaError || error instanceof SignatureError) throw error;
            logger.debug(`Fetch attempt ${attempt}/${retries} failed: ${error.message}`);
            if (attempt === retries) throw error;
            await sleep(API_SETTINGS.RETRY_DELAY * Math.pow(2, attempt - 1));
        }
    }
}

function parseTrpcResponse(text) {
    try {
        const lines = text.split('\n').filter(line => line.trim() !== '');
        if (lines.length === 0) {
            throw new Error("Empty JSONL response from server.");
        }
        const lastLine = lines[lines.length - 1];
        return JSON.parse(lastLine);
    } catch (e) {
        logger.error(`Failed to parse tRPC response: ${text}`);
        throw new Error(`Invalid JSON response: ${text.slice(0, 200)}`);
    }
}

async function trpcPost(path, payload) {
    const url = `${API_SETTINGS.BASE_URL}/${path}?batch=1`;
    const sigPayload = payload?.[0]?.json ?? null;
    try {
        const headers = {
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.9,id;q=0.8',
            'content-type': 'application/json',
            'cookie': COOKIE,
            'origin': 'https://app.appleville.xyz',
            'priority': 'u=1, i',
            'referer': 'https://app.appleville.xyz/',
            'sec-ch-ua': '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'trpc-accept': 'application/jsonl',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
            'x-trpc-source': 'nextjs-react',
            ...(await mutationHeaders(sigPayload)),
        };
        const res = await fetchWithRetry(url, { method: 'POST', headers, body: JSON.stringify(payload) });
        const text = await res.text();
        logger.debug(`Response from ${path}: ${text}`);
        return parseTrpcResponse(text);
    } catch (error) {
        if (error instanceof CaptchaError || error instanceof SignatureError) throw error;
        logger.error(`trpcPost failed for ${path}: ${error.message}`);
        throw error;
    }
}

async function trpcGet(path) {
    const url = `${API_SETTINGS.BASE_URL}/${path}?batch=1`;
    try {
        const res = await fetchWithRetry(url, { method: 'GET', headers: { 'cookie': COOKIE, 'accept': 'application/json' } });
        const text = await res.text();
        return JSON.parse(text);
    } catch (error) {
        if (error instanceof CaptchaError || error instanceof SignatureError) throw error;
        logger.error(`trpcGet failed for ${path}: ${error.message}`);
        throw error;
    }
}

// --- FUNGSI AKSI API ---

const handleApiResponse = (response) => {
    const error = response?.error?.json || response?.result?.error;
    if (error) return { ok: false, error };

    let data = response?.result?.data?.json;
    if (data) return { ok: true, data };

    if (response.json && Array.isArray(response.json)) {
        try {
            const potentialData = response.json[2][0][0];
            if (typeof potentialData === 'object' && potentialData !== null) {
                return { ok: true, data: potentialData };
            }
        } catch (e) { }
    }

    return { ok: false, error: { message: 'Unknown API response format' } };
};

export const api = {
    getState: async () => {
        try {
            const data = await trpcGet('auth.me,core.getState');
            if (Array.isArray(data) && data.length >= 2) {
                return { ok: true, user: data[0]?.result?.data?.json, state: data[1]?.result?.data?.json };
            }
            return { ok: false, error: { message: 'Invalid state response' } };
        } catch (error) { throw error; }
    },
    plantSeed: async (slotIndex, seedKey) => {
        const response = await trpcPost('core.plantSeed', payloads.plantSeedPayload(slotIndex, seedKey));
        return handleApiResponse(response);
    },
    harvestSlot: async (slotIndex) => {
        const response = await trpcPost('core.harvest', payloads.harvestPayload(slotIndex));
        return handleApiResponse(response);
    },
    applyModifier: async (slotIndex, modifierKey) => {
        const response = await trpcPost('core.applyModifier', payloads.applyModifierPayload(slotIndex, modifierKey));
        return handleApiResponse(response);
    },
    buyItem: async (key, quantity) => {
        const response = await trpcPost('core.buyItem', payloads.buyItemPayload(key, quantity));
        return handleApiResponse(response);
    },
    harvestMultiple: async (slotIndexes) => {
        const response = await trpcPost('core.harvest', payloads.harvestMultiplePayload(slotIndexes));
        return handleApiResponse(response);
    },
    plantMultiple: async (plantings) => {
        const response = await trpcPost('core.plantSeed', payloads.plantMultiplePayload(plantings));
        return handleApiResponse(response);
    },
};
