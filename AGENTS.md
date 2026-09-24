# PANDUAN PENGEMBANGAN & ATURAN KEAMANAN (AGENTS.md)

Dokumen ini adalah aturan wajib bagi AI Agent yang bekerja di dalam direktori `D:\TEMPLATE FENBOT CLOUD\TEMPLATE BOT DIGIFLAZZ`.

---

## 1. Batasan Kerja (Scope Boundaries)

1. **Ruang Lingkup**:
   - Agen HANYA beroperasi dan melakukan perubahan pada skrip bot WhatsApp di dalam folder ini (`commands/`, `lib/`, `database/`, `index.js`, `message.js`, `fenbot.config.json`).
2. **Isolasi Database PostgreSQL FENBOT Cloud**:
   - Skrip bot ini adalah aplikasi client independen yang berjalan di container Pterodactyl.
   - Bot **TIDAK memiliki koneksi langsung** ke database PostgreSQL. Komunikasi ke control plane FENBOT Cloud hanya melalui HTTP API Internal (`lib/fenbot-client.js`).
   - Agen **DILARANG KERAS** menjalankan perintah yang merusak database seperti:
     - `prisma migrate reset`
     - `prisma db push --force-reset`
     - Script DROP TABLE atau query database mentah.
   - Dilarang memodifikasi file inti website FENBOT Cloud di luar folder template ini tanpa instruksi eksplisit.

---

## 2. Struktur Penyimpanan Data Bot

- Bot ini menggunakan penyimpanan file JSON lokal di folder `database/` (`deposits.json`, `products.json`, `qris_orders.json`, `settings.json`) sebagai cache dan penyimpanan transaksi lokal bot.
- Segala mutasi saldo pelanggan yang terhubung ke cloud dilakukan melalui metode resmi `fenbot-client.js` (`debit`, `credit`, `reserve`, `release`).

---

## 3. Alur Penambahan Fitur & Maintenance

- Baca dokumen referensi: [`DIGIFLAZZ_BOT_CONTEXT.md`](file:///d:/TEMPLATE%20FENBOT%20CLOUD/TEMPLATE%20BOT%20DIGIFLAZZ/DIGIFLAZZ_BOT_CONTEXT.md)
- Periksa daftar tugas yang diminta pengguna di: [`BOT_TASKS.md`](file:///d:/TEMPLATE%20FENBOT%20CLOUD/TEMPLATE%20BOT%20DIGIFLAZZ/BOT_TASKS.md)
- Jalankan penambahan/perubahan kode dengan aman tanpa merusak struktur komunikasi internal yang sudah ada.
