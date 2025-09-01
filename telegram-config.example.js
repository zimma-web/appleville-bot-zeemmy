// =================================================================
// TELEGRAM CONFIGURATION EXAMPLE
// Salin file ini menjadi 'telegram-config.js' dan isi detailnya.
// =================================================================

export const TELEGRAM_SETTINGS = {
    ENABLED: true, // Set false untuk menonaktifkan notifikasi Telegram
    
    // Token bot Telegram dari @BotFather
    BOT_TOKEN: 'YOUR_BOT_TOKEN_HERE',
    
    // ID chat/group tempat bot akan mengirim pesan
    // Untuk chat pribadi: gunakan user ID
    // Untuk group: gunakan group ID (biasanya negatif)
    CHAT_ID: 'YOUR_CHAT_ID_HERE',
    
    // Pengaturan notifikasi
    NOTIFY_ON_BATCH_COMPLETE: true,    // Notifikasi setiap batch selesai
    NOTIFY_ON_ERROR: true,              // Notifikasi saat terjadi error
    NOTIFY_ON_CAPTCHA: true,            // Notifikasi saat CAPTCHA diperlukan
    NOTIFY_ON_SIGNATURE_ERROR: true,    // Notifikasi saat signature error
    
    // Format pesan
    USE_EMOJI: true,                    // Gunakan emoji dalam pesan
    USE_MARKDOWN: true,                 // Gunakan format Markdown
};

// =================================================================
// CARA MENDAPATKAN BOT_TOKEN DAN CHAT_ID:
// =================================================================
// 1. Buat bot di @BotFather di Telegram
// 2. Dapatkan token bot dari pesan yang dikirim BotFather
// 3. Untuk mendapatkan CHAT_ID:
//    - Kirim pesan ke bot Anda
//    - Akses: https://api.telegram.org/bot<BOT_TOKEN>/getUpdates
//    - Cari "chat" -> "id" dalam response JSON
// =================================================================
