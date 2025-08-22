// =================================================================
// CONFIGURATION FILE
// Semua pengaturan dan data konstan untuk bot ada di sini.
// =================================================================

/**
 * Pengaturan Default untuk Bot
 * Nilai-nilai ini akan digunakan jika pengguna tidak memberikan input.
 */
export const DEFAULT_SETTINGS = {
    SLOTS: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    SEED: 'royal-apple',
    BUY_QTY_SEED: 12,
    BOOSTER: 'quantum-fertilizer',
    BUY_QTY_BOOSTER: 12,
    AUTO_REFRESH_BOOSTER: true,
    DEBUG_MODE: false,

};

/**
 * Pengaturan API dan Jaringan
 */
export const API_SETTINGS = {
    BASE_URL: 'https://app.appleville.xyz/api/trpc',
    MAX_RETRIES: 3,
    RETRY_DELAY: 2000, // dalam milidetik
    PAUSE_MS: 150, // jeda singkat antar panggilan API
};

/**
 * Data Bibit (Seeds)
 * Kunci objek (e.g., 'wheat') harus cocok dengan 'key' dari API.
 */
export const SEEDS = {
    'wheat': { name: 'Wheat', price: 2, priceCurrency: 'coins', growSeconds: 5 },
    'lettuce': { name: 'Lettuce', price: 8, priceCurrency: 'coins', growSeconds: 30 },
    'golden-apple': { name: 'Golden Apple', price: 10, priceCurrency: 'apples', growSeconds: 120 },
    'carrot': { name: 'Carrot', price: 25, priceCurrency: 'coins', growSeconds: 180 },
    'crystal-apple': { name: 'Crystal Apple', price: 40, priceCurrency: 'apples', growSeconds: 600 },
    'tomato': { name: 'Tomato', price: 80, priceCurrency: 'coins', growSeconds: 900 },
    'onion': { name: 'Onion', price: 200, priceCurrency: 'coins', growSeconds: 3600 },
    'diamond-apple': { name: 'Diamond Apple', price: 150, priceCurrency: 'apples', growSeconds: 3600 },
    'royal-apple': { name: 'Royal Apple', price: 500, priceCurrency: 'apples', growSeconds: 18000 },
    'strawberry': { name: 'Strawberry', price: 600, priceCurrency: 'coins', growSeconds: 14400 },
    'pumpkin': { name: 'Pumpkin', price: 1500, priceCurrency: 'coins', growSeconds: 43200 },
};

/**
 * Data Booster (Modifiers)
 * Kunci objek (e.g., 'fertiliser') harus cocok dengan 'key' dari API.
 */
export const BOOSTERS = {
    'fertiliser': { name: 'Fertiliser', price: 18, priceCurrency: 'coins', effect: '+43% growth, 12h' },
    'silver-tonic': { name: 'Silver Tonic', price: 15, priceCurrency: 'coins', effect: '+25% yield, 12h' },
    'super-fertiliser': { name: 'Super Fertiliser', price: 25, priceCurrency: 'apples', effect: '+100% growth, 12h' },
    'golden-tonic': { name: 'Golden Tonic', price: 50, priceCurrency: 'apples', effect: '+100% yield, 12h' },
    'deadly-mix': { name: 'Deadly Mix', price: 150, priceCurrency: 'apples', effect: '-40% yield, +700% growth, 12h' },
    'quantum-fertilizer': { name: 'Quantum Fertilizer', price: 175, priceCurrency: 'apples', effect: '+50% yield, +150% growth, 12h' },
};