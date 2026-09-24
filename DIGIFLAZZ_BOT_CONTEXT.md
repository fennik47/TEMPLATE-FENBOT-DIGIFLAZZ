# Konteks Arsitektur Bot WhatsApp Digiflazz PPOB (FENBOT Cloud)

Dokumen ini adalah referensi konteks utama bagi AI Agent saat melakukan pemeliharaan, perbaikan bug, atau penambahan fitur baru pada template Bot WhatsApp Digiflazz PPOB.

---

## 1. Lokasi & Struktur Direktori

Direktori utama template bot:
`storage/templates/bot-digiflazz/`

Struktur folder utama:
- `index.js`: Titik masuk utama bot, inisialisasi koneksi Baileys socket, event listener pesan, pairing code, dan penanganan koneksi WhatsApp.
- `message.js`: Router pesan WhatsApp, parsing prefix perintah, middleware otorisasi (owner/admin/user), normalisasi nomor LID ke JID, dan pemanggilan modul perintah.
- `commands/`: Kumpulan modul perintah bot:
  - `commands/digiflazz.js`: Logika transaksi Digiflazz PPOB, cek harga, order pulsa/data/game, cek saldo Digiflazz, dan riwayat transaksi.
  - Perintah grup, utilitas, owner, dan informasi sistem.
- `lib/`: Pustaka pendukung:
  - `lib/digiflazz.js`: Klien HTTP API Digiflazz (MD5 signature generation, endpoint `/v1/transaction`, `/v1/price-list`, `/v1/cek-saldo`).
  - Pustaka database lokal, utilitas format rupiah, waktu, dan logger.
- `database/`: Penyimpanan data lokal bot (JSON/SQLite untuk saldo pengguna, antrean transaksi, sesi transaksi aktif).
- `fenbot.config.json`: Skema konfigurasi dan formulir pengaturan bot yang terintegrasi dengan web panel FENBOT Cloud.
- `build-sc.js`: Skrip packaging template menjadi arsip zip siap distribusi ke Pterodactyl.

---

## 2. Cara Kerja Integrasi Digiflazz PPOB

1. **Pembuatan Signature MD5**:
   Format signature resmi Digiflazz:
   `md5(username + apiKey + ref_id)` untuk transaksi.
   `md5(username + apiKey + "depo")` untuk cek saldo.
   `md5(username + apiKey + "pricelist")` untuk cek daftar harga.

2. **Status Transaksi**:
   - `Pending`: Transaksi sedang diproses oleh Digiflazz / operator.
   - `Sukses`: Transaksi berhasil, pulsa/kuota/voucher terkirim ke nomor target.
   - `Gagal`: Transaksi ditolak atau saldo Digiflazz tidak cukup, sistem harus mengembalikan (*refund*) saldo ke dompet pengguna bot.

3. **Normalisasi Kontak WhatsApp (LID to JID)**:
   WhatsApp versi terbaru sering mengirim pesan dengan format ID grup privat (`@lid`). Sistem bot telah dilengkapi normalisasi LID ke JID standar (`@s.whatsapp.net`) agar saldo pengguna tidak tercecer atau hilang saat berpindah perangkat.

---

## 3. Standar Penambahan Fitur Baru

1. **Membuat Perintah Baru di `commands/`**:
   - Buat fungsi handler yang menerima parameter `(sock, m, args, db, config)`.
   - Gunakan format balasan yang rapi, informatif, dan tanpa emoji berlebihan sesuai preferensi pengguna.
   - Berikan penanganan kesalahan (*try-catch*) dengan pesan kesalahan yang jelas dan ramah bagi pengguna WhatsApp.

2. **Menambahkan Opsi Pengaturan Baru**:
   - Jika fitur baru membutuhkan konfigurasi dinamis (misalnya margin laba, pesan pembuka custom, dll.), tambahkan definisi field baru pada `fenbot.config.json` agar pemilik bot bisa mengaturnya langsung dari dashboard web FENBOT Cloud tanpa menyentuh kode.

---

## 4. Alur Kerja Rekomendasi (Task-Driven Development)

Untuk menambahkan fitur atau melakukan maintenance tanpa mengetik prompt panjang di chat:
1. Buka file **`BOT_TASKS.md`**.
2. Tuliskan daftar fitur atau perbaikan bug yang diinginkan pada daftar tugas tersebut.
3. Di obrolan chat AI, cukup ketik perintah singkat:
   `"Kerjakan tugas di BOT_TASKS.md"`
4. AI akan membaca konteks dari dokumen ini, mengeksekusi kodenya, mengetes fungsionalitasnya, dan memperbarui status checklist di `BOT_TASKS.md`.
