# 📱 Setup Notifikasi Telegram untuk AppleVille Bot

## 🎯 Fitur yang Tersedia

Bot sekarang dapat mengirim notifikasi ke Telegram setiap kali batch cycle selesai, termasuk:
- 💰 Saldo koin dan AP
- 🌱 Status slot (aktif, kosong, siap panen)
- 🌾 Inventory bibit
- ⏰ Waktu panen berikutnya
- 🔄 Timestamp batch completion

## 🚀 Cara Setup

### 1. Buat Bot Telegram
1. Buka Telegram dan cari **@BotFather**
2. Kirim pesan `/newbot`
3. Ikuti instruksi untuk membuat bot
4. **Simpan token bot** yang dikirim BotFather

### 2. Dapatkan Chat ID
1. **Untuk chat pribadi:**
   - Kirim pesan ke bot yang baru dibuat
   - Akses: `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates`
   - Cari `"chat" -> "id"` dalam response JSON

2. **Untuk group:**
   - Tambahkan bot ke group
   - Kirim pesan di group
   - Akses URL yang sama, chat ID akan negatif (misal: -123456789)

### 3. Konfigurasi Bot
1. Edit file `telegram-config.js`
2. Ganti `YOUR_BOT_TOKEN_HERE` dengan token bot Anda
3. Ganti `YOUR_CHAT_ID_HERE` dengan chat ID yang didapat

```javascript
export const TELEGRAM_SETTINGS = {
    ENABLED: true,
    BOT_TOKEN: '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz', // Token bot Anda
    CHAT_ID: '123456789', // Chat ID Anda
    // ... pengaturan lainnya
};
```

### 4. Test Notifikasi
1. Jalankan bot: `node main.js`
2. Tunggu batch cycle selesai
3. Cek Telegram untuk notifikasi

## ⚙️ Pengaturan Lanjutan

### Notifikasi yang Dapat Diatur:
- `NOTIFY_ON_BATCH_COMPLETE`: Notifikasi setiap batch selesai ✅
- `NOTIFY_ON_ERROR`: Notifikasi saat error ❌
- `NOTIFY_ON_CAPTCHA`: Notifikasi saat CAPTCHA diperlukan ⚠️
- `NOTIFY_ON_SIGNATURE_ERROR`: Notifikasi signature error 🔑

### Format Pesan:
- `USE_EMOJI`: Gunakan emoji dalam pesan 🌾
- `USE_MARKDOWN`: Gunakan format Markdown **bold**

## 🔧 Troubleshooting

### Bot tidak mengirim pesan?
1. Pastikan `ENABLED: true`
2. Cek token bot valid
3. Cek chat ID benar
4. Pastikan bot sudah di-start di chat/group

### Error "Forbidden"?
- Bot belum di-start di chat
- Chat ID salah
- Bot tidak punya permission di group

### Error "Unauthorized"?
- Token bot salah
- Bot sudah di-delete

## 📝 Contoh Pesan yang Dikirim

```
🌾 BATCH CYCLE SELESAI 🌾

💰 Saldo Akun:
• Koin: 890
• AP: 13040.28

🌱 Status Slot:
• Aktif: 1/12
• Kosong: 11
• Siap Panen: 0

🌾 Inventory:
• legacy-apple: 18

⏰ Panen Berikutnya: 2m 15s

🔄 Waktu: 02/01/2025, 02:53:17
```

## 🎉 Selesai!

Setelah setup selesai, bot akan otomatis mengirim notifikasi ke Telegram setiap kali batch cycle selesai, memberikan Anda update real-time tentang status farming tanpa perlu membuka console!
