# 🌱 AppleVille Smart Bot — Table Ticker + Clean Logs

Bot Node.js untuk otomatis **cek/plant/booster/harvest** dan menampilkan countdown **per-slot** dalam tabel rapi (anti-spam) menggunakan [`log-update`](https://www.npmjs.com/package/log-update), [`cli-table3`](https://www.npmjs.com/package/cli-table3), dan [`picocolors`](https://www.npmjs.com/package/picocolors).

---

## ✨ Fitur

- **Ticker tabel 2 tingkat**: ringkas, jelas, tidak nyepam.
- **Smart countdown**: tampilkan waktu sisa **P:** (plant/crop) & **B:** (booster) untuk tiap slot.
- **Auto apply booster** pada slot yang belum/kehabisan booster (termasuk pembelian otomatis bila stok kurang).
- **Update `endsAt`** setelah booster diterapkan/diperbarui di tengah grow.
- **COOKIE via `akun.txt`**: jika belum ada, bot minta input cookie 1x lalu menyimpannya otomatis.

> **Catatan:** Script ini hanya memanggil endpoint TRPC publik AppleVille seperti yang dilakukan web-app nya.

---

## 🔧 Prasyarat

- **Node.js 18+** (disarankan Node 20/22).
- Sudah login AppleVille di browser (punya **cookie** session yang valid).

---

## 📦 Instalasi

```bash
# (opsional) buat folder
mkdir appleville-bot && cd appleville-bot

# simpan file: apple.js (kode bot) di folder ini

# install dependencies tampilan terminal
npm i log-update cli-table3 picocolors
```

> Script memakai **fetch bawaan Node 18+**, jadi tidak perlu `node-fetch`.

---

## 🔑 Setup Cookie (`akun.txt`)

- **Otomatis (disarankan)**: saat pertama kali menjalankan, jika `akun.txt` belum ada/kosong, bot akan **meminta cookie** di terminal dan **menyimpannya** ke `akun.txt`.
- **Manual**:

  1. Buat file `akun.txt` di folder yang sama dengan `apple.js`.
  2. Isi **satu baris** cookie lengkap Anda, lalu simpan.

> Contoh isi `akun.txt` (hanya contoh, bukan valid):
>
> ```
> __Host-authjs.csrf-token=...; __Secure-authjs.callback-url=...; session-token=...
> ```

**Keamanan:** `akun.txt` berisi kredensial. **JANGAN commit** file ini. Lihat `.gitignore` di bawah.

---

## ▶️ Menjalankan

```bash
node apple.js
```

Ikuti prompt:

- Masukkan **slot** (misal: `1,2,3,4,5,6,7,8,9,10,11,12`).
- Pilih **seed** (misal: `royal-apple`).
- Masukkan **buy quantity** seed saat habis (misal: `12`).
- Pilih **booster** (misal: `quantum-fertilizer`).
- Masukkan **buy quantity** booster saat habis (misal: `12`).

> Tampilan terminal akan memperlihatkan **tabel** dengan countdown **P:** (plant) dan **B:** (booster) untuk tiap slot, disortir berdasarkan waktu panen terdekat.

---

## 🖥️ Opsi Terminal

- `--plain` → non-warna (untuk terminal lama/CI).
- `--ascii` → tanpa emoji/border Unicode.

> Fallback non-TTY: bila terminal tidak mendukung _live update_, bot akan mencetak ringkasan berkala agar tidak spam.

---

## 🧰 Troubleshooting

- **Karakter aneh “B�” di Windows** → jalankan dengan `--ascii` atau gunakan Windows Terminal/VS Code Terminal.
- **`TypeError: logUpdate is not a function`** → pastikan `npm i log-update` sudah dilakukan **di folder yang sama**.
- **Bot tidak panen/plant** → cookie expired. Ambil cookie baru (login ulang di browser), lalu hapus isi `akun.txt` dan jalankan lagi (bot akan minta input cookie baru).
- **`Node 18+ diperlukan (fetch builtin)`** → upgrade Node.js Anda.

---

## 🔒 .gitignore (disarankan)

Tambahkan file `.gitignore` berikut agar kredensial tidak ikut ter-commit:

```gitignore
# dependencies
node_modules/

# logs & cache
npm-debug.log*
yarn-error.log*
.pnpm-debug.log*
.DS_Store

# env / secrets
.env
akun.txt
```

---

## ⚠️ Disclaimer

Script ini bukan bagian resmi dari AppleVille. Gunakan sesuai kebijakan layanan. Segala risiko ditanggung pengguna.


