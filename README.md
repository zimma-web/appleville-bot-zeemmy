# 🤖 AppleVille Smart Bot — Arsitektur Modern & Andal

Bot Node.js yang dirancang ulang dengan arsitektur modern untuk otomatisasi **tanam, booster, dan panen** di AppleVille. Bot ini beroperasi dengan presisi tinggi, mengelola setiap slot secara independen dan paralel tanpa memerlukan dependensi eksternal.

---

## ✨ Fitur Unggulan

-   **Manajemen Timer Paralel**: Setiap slot tanaman dan booster memiliki *timer* presisinya sendiri yang berjalan secara independen, memastikan aksi dieksekusi tepat waktu.
-   **Logika Cerdas & Andal**: Bot tidak akan memaksakan aksi. Ia akan menunggu *booster* yang ada selesai sebelum memasang yang baru dan menangani setiap slot secara individual untuk mencegah kegagalan berantai.
-   **Nol Dependensi Eksternal**: Dijalankan murni dengan Node.js bawaan. Tidak perlu `npm install`, membuat setup menjadi super ringan dan cepat.
-   **Ringan & Efisien**: Kode yang bersih dan modular memudahkan pemahaman, modifikasi, dan *debugging*.
-   **Setup Cookie Otomatis**: Cukup jalankan sekali, bot akan meminta *cookie* Anda dan menyimpannya di `akun.txt` untuk penggunaan selanjutnya.

---

## 🔧 Prasyarat

-   **Node.js v18+** (disarankan v20 atau yang lebih baru).
-   **Git** (untuk metode instalasi yang disarankan).

---

## 📦 Instalasi & Setup

### Opsi 1: Git Clone (Disarankan)

Ini adalah cara termudah dan tercepat untuk memulai.

1.  **Clone Repositori**: Buka terminal Anda dan jalankan perintah berikut.
    ```bash
    git clone https://github.com/caraka15/appleville-bot.git
    ```

2.  **Masuk ke Folder**:
    ```bash
    cd appleville-bot
    ```

Selesai! Tidak ada `npm install` yang diperlukan. Proyek sudah siap dijalankan karena `package.json` sudah termasuk di dalamnya.

### Opsi 2: Setup Manual

Gunakan cara ini jika Anda tidak bisa menggunakan Git.

1.  **Unduh & Buka Folder**: Dapatkan semua file proyek (`main.js`, `config.js`, folder `core`, `services`, `utils`) dan letakkan di dalam satu folder.
2.  **Inisialisasi Proyek**: Buka terminal di dalam folder tersebut dan jalankan perintah ini untuk membuat file `package.json`.
    ```bash
    npm init -y
    ```
3.  **Aktifkan ES Modules**: Buka file `package.json` yang baru dibuat, dan tambahkan baris berikut untuk mengaktifkan sintaks `import`/`export` modern.
    ```json
    "type": "module",
    ```

---

## 🔑 Setup Cookie (`akun.txt`)

Bot memerlukan *cookie* sesi Anda untuk berinteraksi dengan server.

-   **Cara Mendapatkan Cookie**:
    1.  Buka AppleVille di browser Anda dan login.
    2.  Tekan `F12` untuk membuka Developer Tools.
    3.  Buka tab **Network** (Jaringan).
    4.  Cari *request* apa pun ke API (misalnya, `getState` atau `harvest`).
    5.  Di bagian **Headers**, cari *request header* bernama `cookie`.
    6.  **Copy seluruh nilai** dari header `cookie` tersebut.

-   **Penggunaan**:
    Saat Anda menjalankan bot untuk pertama kali, ia akan meminta Anda untuk mem-paste *cookie* tersebut. Setelah itu, *cookie* akan disimpan di `akun.txt` dan tidak akan diminta lagi.

---

## ▶️ Menjalankan Bot

Pastikan Anda berada di direktori utama proyek di terminal Anda, lalu jalankan:

```bash
node main.js
```

Bot akan memandu Anda melalui beberapa pertanyaan konfigurasi awal (slot, bibit, booster) dan kemudian akan mulai beroperasi secara otomatis.

---

## 🎛️ Konfigurasi

Semua pengaturan utama dapat diubah langsung di dalam file `config.js`, termasuk:
-   `DEBUG_MODE`: Ubah menjadi `true` untuk melihat log *debug* yang detail.
-   Pengaturan default untuk bibit, booster, dan jumlah pembelian.

---

## 🧰 Troubleshooting

-   **Error `SyntaxError: Cannot use import statement outside a module`**: Pastikan Anda sudah menambahkan `"type": "module"` di dalam `package.json` (hanya untuk setup manual).
-   **Bot Gagal Terhubung / Error 401**: Kemungkinan besar *cookie* Anda sudah kedaluwarsa. Hapus file `akun.txt` dan jalankan ulang bot. Ia akan meminta Anda untuk memasukkan *cookie* yang baru.
-   **Bot Gagal Memasang Booster (Error 400)**: Pastikan Anda tidak menjalankan beberapa instance bot secara bersamaan, karena ini dapat menyebabkan konflik aksi.

---

## ⚠️ Disclaimer

Ini adalah proyek tidak resmi dan tidak berafiliasi dengan AppleVille. Gunakan dengan bijak dan segala risiko ditanggung oleh pengguna.
