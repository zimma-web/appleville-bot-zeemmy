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
    SEED: 'apex-apple',
    BUY_QTY_SEED: 12,
    BOOSTER: 'apex-potion',
    BUY_QTY_BOOSTER: 12,
    AUTO_REFRESH_BOOSTER: true,
    DEBUG_MODE: false, // Ubah ke true untuk mengaktifkan debug.
};

/**
 * Pengaturan API dan Jaringan
 */
export const API_SETTINGS = {
    BASE_URL: 'https://app.appleville.xyz/api/trpc',
    MAX_RETRIES: 3,
    RETRY_DELAY: 200, // dalam milidetik (dikurangi drastis untuk kecepatan maksimal)
    PAUSE_MS: 25, // jeda antar panggilan API (dikurangi drastis untuk kecepatan maksimal)
    BATCH_DELAY: 50, // jeda antar operasi batch (dikurangi drastis untuk kecepatan maksimal)
    HARVEST_DELAY: 25, // jeda antar panen (dikurangi drastis untuk kecepatan maksimal)
    PLANT_DELAY: 25, // jeda antar tanam (dikurangi drastis untuk kecepatan maksimal)
    BOOSTER_DELAY: 25, // jeda antar pemasangan booster (dikurangi drastis untuk kecepatan maksimal)
    MAX_CONCURRENT_REQUESTS: 5, // maksimal request bersamaan (ditingkatkan untuk kecepatan)
};

/**
 * [BARU] Pengaturan untuk Batch Processing
 * Bibit yang ada di daftar ini akan dipanen & ditanam secara massal.
 */
export const BATCH_SETTINGS = {
    ENABLED_SEEDS: ['wheat', 'lettuce'], // Tambahkan bibit cepat lainnya di sini
    INTERVAL: 500, // Cek setiap 0.5 detik (dipercepat drastis untuk responsivitas maksimal)
};

/**
 * Data Bibit (Seeds)
 * Kunci objek (e.g., 'wheat') harus cocok dengan 'key' dari API.
 */
export const SEEDS = {
    // Bibit Tanpa Prestige
    'wheat': { name: 'Wheat', price: 2, priceCurrency: 'coins', growSeconds: 5, reward: 5, rewardCurrency: 'coins' },
    'lettuce': { name: 'Lettuce', price: 8, priceCurrency: 'coins', growSeconds: 30, reward: 15, rewardCurrency: 'coins' },
    'golden-apple': { name: 'Golden Apple', price: 10, priceCurrency: 'apples', growSeconds: 120, reward: 15, rewardCurrency: 'apples' },
    'carrot': { name: 'Carrot', price: 25, priceCurrency: 'coins', growSeconds: 180, reward: 50, rewardCurrency: 'coins' },
    'crystal-apple': { name: 'Crystal Apple', price: 40, priceCurrency: 'apples', growSeconds: 600, reward: 70, rewardCurrency: 'apples' },
    'tomato': { name: 'Tomato', price: 80, priceCurrency: 'coins', growSeconds: 900, reward: 180, rewardCurrency: 'coins' },
    'onion': { name: 'Onion', price: 200, priceCurrency: 'coins', growSeconds: 3600, reward: 500, rewardCurrency: 'coins' },
    'diamond-apple': { name: 'Diamond Apple', price: 150, priceCurrency: 'apples', growSeconds: 3600, reward: 300, rewardCurrency: 'apples' },
    'strawberry': { name: 'Strawberry', price: 600, priceCurrency: 'coins', growSeconds: 14400, reward: 1500, rewardCurrency: 'coins' },
    'platinum-apple': { name: 'Platinum Apple', price: 500, priceCurrency: 'apples', growSeconds: 14400, reward: 1200, rewardCurrency: 'apples' },
    'pumpkin': { name: 'Pumpkin', price: 750, priceCurrency: 'coins', growSeconds: 43200, reward: 5000, rewardCurrency: 'coins' },
    'royal-apple': { name: 'Royal Apple', price: 1500, priceCurrency: 'apples', growSeconds: 43200, reward: 4000, rewardCurrency: 'apples' },

    // Bibit dengan Prestige
    'legacy-apple': { name: 'Legacy Apple', price: 8, priceCurrency: 'apples', growSeconds: 60, prestige: 1, reward: 14, rewardCurrency: 'apples' },
    'ascendant-apple': { name: 'Ascendant Apple', price: 60, priceCurrency: 'apples', growSeconds: 300, prestige: 2, reward: 100, rewardCurrency: 'apples' },
    'relic-apple': { name: 'Relic Apple', price: 120, priceCurrency: 'apples', growSeconds: 2700, prestige: 3, reward: 400, rewardCurrency: 'apples' },
    'ethereal-apple': { name: 'Ethereal Apple', price: 400, priceCurrency: 'apples', growSeconds: 7200, prestige: 4, reward: 1300, rewardCurrency: 'apples' },
    'quantum-apple': { name: 'Quantum Apple', price: 1500, priceCurrency: 'apples', growSeconds: 28800, prestige: 5, reward: 5000, rewardCurrency: 'apples' },
    'celestial-apple': { name: 'Celestial Apple', price: 2500, priceCurrency: 'apples', growSeconds: 36000, prestige: 6, reward: 8500, rewardCurrency: 'apples' },
    'apex-apple': { name: 'Apex Apple', price: 3000, priceCurrency: 'apples', growSeconds: 43200, prestige: 7, reward: 11000, rewardCurrency: 'apples' },
};

/**
 * Data Booster (Modifiers)
 * Kunci objek (e.g., 'fertiliser') harus cocok dengan 'key' dari API.
 */
export const BOOSTERS = {
    // Booster Tanpa Prestige
    'fertiliser': { name: 'Fertiliser', price: 10, priceCurrency: 'coins', effect: '+43% growth speed, for 12hr' },
    'silver-tonic': { name: 'Silver Tonic', price: 15, priceCurrency: 'coins', effect: '+25% yield, for 12hr' },
    'super-fertiliser': { name: 'Super Fertiliser', price: 25, priceCurrency: 'apples', effect: '+100% growth speed, for 12hr' },
    'golden-tonic': { name: 'Golden Tonic', price: 50, priceCurrency: 'apples', effect: '+100% yield, for 12hr' },
    'deadly-mix': { name: 'Deadly Mix', price: 150, priceCurrency: 'apples', effect: '-40% yield, +700% growth speed, for 12hr' },
    'quantum-fertilizer': { name: 'Quantum Fertilizer', price: 175, priceCurrency: 'apples', effect: '+50% yield, +150% growth speed, for 12hr' },
    'potion-of-gains': { name: 'Potion of Gains', price: 15, priceCurrency: 'apples', effect: '+67% growth speed, for 12hr' },

    // Booster dengan Prestige
    'elixir-of-degens': { name: 'Elixir of Degens', price: 30, priceCurrency: 'apples', effect: '+75% yield, for 12hr', prestige: 2 },
    'giga-brew': { name: 'Giga Brew', price: 75, priceCurrency: 'apples', effect: '+40% yield, +67% growth speed, for 12hr', prestige: 3 },
    'wild-growth': { name: 'Wild Growth', price: 100, priceCurrency: 'apples', effect: '+200% yield, -20% growth speed, for 12hr', prestige: 4 },
    'warp-time-elixir': { name: 'Warp-Time Elixir', price: 500, priceCurrency: 'apples', effect: '+400% growth speed, for 12hr', prestige: 5 },
    'titans-growth': { name: 'Titan\'s Growth', price: 1000, priceCurrency: 'apples', effect: '+400% yield, -33% growth speed, for 24hr', prestige: 6 },
    'apex-potion': { name: 'Apex Potion', price: 5000, priceCurrency: 'apples', effect: '+100% yield, +233% growth speed, for 12hr', prestige: 7 },
};

/**
 * [BARU] Data Level Prestige
 * Berisi informasi multiplier keuntungan AP dan biaya upgrade.
 */
export const PRESTIGE_LEVELS = {
    1: { multiplier: 1.2, apRequired: 60000 },
    2: { multiplier: 1.4, apRequired: 150000 },
    3: { multiplier: 1.5, apRequired: 300000 },
    4: { multiplier: 1.6, apRequired: 500000 },
    5: { multiplier: 1.8, apRequired: 750000 },
    6: { multiplier: 1.9, apRequired: 900000 },
    7: { multiplier: 2.0, apRequired: 1000000 },
};

/**
 * [BARU] COMBO PRESETS - Kombinasi Seed + Booster yang Populer
 * Memudahkan pengguna memilih kombinasi yang sudah terbukti efektif
 */
export const COMBO_PRESETS = {
    // COMBO UNTUK PEMULA (Tanpa Prestige)
    'beginner-fast': {
        name: '🚀 Pemula Cepat',
        description: 'Wheat + Fertiliser - Panen cepat untuk pemula',
        seed: 'wheat',
        booster: 'fertiliser',
        seedBuyQty: 50,
        boosterBuyQty: 20,
        prestige: 0
    },
    'beginner-profit': {
        name: '💰 Pemula Profit',
        description: 'Lettuce + Silver Tonic - Balance kecepatan dan profit',
        seed: 'lettuce',
        booster: 'silver-tonic',
        seedBuyQty: 30,
        boosterBuyQty: 15,
        prestige: 0
    },
    
    // COMBO UNTUK MENENGAH
    'intermediate-apple': {
        name: '🍎 Menengah Apple',
        description: 'Golden Apple + Super Fertiliser - Apple farming yang efisien',
        seed: 'golden-apple',
        booster: 'super-fertiliser',
        seedBuyQty: 20,
        boosterBuyQty: 10,
        prestige: 0
    },
    'intermediate-coin': {
        name: '🪙 Menengah Coin',
        description: 'Carrot + Golden Tonic - Coin farming yang solid',
        seed: 'carrot',
        booster: 'golden-tonic',
        seedBuyQty: 15,
        boosterBuyQty: 8,
        prestige: 0
    },
    
    // COMBO UNTUK ADVANCED
    'advanced-speed': {
        name: '⚡ Advanced Speed',
        description: 'Crystal Apple + Deadly Mix - Speed farming maksimal',
        seed: 'crystal-apple',
        booster: 'deadly-mix',
        seedBuyQty: 12,
        boosterBuyQty: 6,
        prestige: 0
    },
    'advanced-profit': {
        name: '💎 Advanced Profit',
        description: 'Diamond Apple + Quantum Fertilizer - Profit farming optimal',
        seed: 'diamond-apple',
        booster: 'quantum-fertilizer',
        seedBuyQty: 12,
        boosterBuyQty: 6,
        prestige: 0
    },
    
    // COMBO UNTUK EXPERT
    'expert-long': {
        name: '🏆 Expert Long Term',
        description: 'Royal Apple + Apex Potion - Long term farming (Prestige 7)',
        seed: 'royal-apple',
        booster: 'apex-potion',
        seedBuyQty: 12,
        boosterBuyQty: 6,
        prestige: 7
    },
    'expert-legacy': {
        name: '👑 Expert Legacy',
        description: 'Legacy Apple + Apex Potion - Prestige farming (Prestige 1+)',
        seed: 'legacy-apple',
        booster: 'apex-potion',
        seedBuyQty: 12,
        boosterBuyQty: 6,
        prestige: 1
    },
    
    // COMBO CUSTOM
    'custom': {
        name: '⚙️ Custom Setup',
        description: 'Pilih seed dan booster sendiri',
        seed: null,
        booster: null,
        seedBuyQty: 12,
        boosterBuyQty: 12,
        prestige: 0
    }
};