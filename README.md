# 🚀 WhatsApp Store Bot Digiflazz V.1 (Premium Edition)

Bot WhatsApp Store H2H yang powerfull, stabil, dan siap pakai untuk bisnis top-up digital Anda. Terintegrasi dengan **Digiflazz API** dan dilengkapi fitur premium seperti **Tautan Akun (Anti-LID)**, **Visual Invoice Otomatis**, hingga **Laporan Transaksi ke Owner**.

---

## ✨ Fitur-Fitur Utama (Menu Publik & Admin)
Bot ini memiliki berbagai command yang bisa digunakan oleh user maupun owner.

1. **Sistem Saldo Multi-Role (Bronze, Silver, Gold, Platinum)**
   Bot menerapkan sistem harga bertingkat. User dengan role lebih tinggi akan mendapatkan harga yang lebih murah (markup lebih kecil).
   - `.addsaldo @tag nominal` : Owner bisa menambah saldo user dengan me-reply atau me-tag pesan user.
   - `.setrole @tag GOLD` : Owner bisa menaikkan kasta member ke role yang lebih tinggi.
   - `.saldo` : User mengecek saldo dan level rolenya.

2. **Pembelian Produk (Top-up)**
   - `.topup ml` : User mencari daftar produk yang tersedia berdasarkan merek.
   - `.buy ML10 12345678` : User melakukan order. Sistem bot cukup pintar untuk menggabungkan spasi otomatis jika diperlukan untuk format game tertentu (seperti Genshin Impact atau Mobile Legends).

3. **Sinkronisasi Saldo Grup & Private Chat (LID)**
   WhatsApp versi terbaru menyembunyikan nomor asli member di grup (ID Anonim / `@lid`).
   - `.link` : Menghasilkan kode tautan di Private Chat.
   - `.link <kode>` : User menautkan akunnya di grup. Saldo akan langsung tersinkronisasi selamanya!

4. **Dynamic Welcome & Goodbye**
   - Mengirim gambar ke bot dengan caption `.setbgwelcome` atau `.setbggoodbye` akan mengganti background sapaan secara otomatis.
   - `.setwelcome on/off` : Menghidupkan fitur sapaan visual (dengan foto profil, nama, dan nama grup) setiap ada yang keluar/masuk grup.



---

## 🕵️‍♂️ Fitur Tersembunyi (Sistem Otomatis / Background)
Bot ini dilengkapi sistem canggih yang berjalan di belakang layar (*Background Loop*) tanpa perlu dipanggil lewat command:

1. **Auto-Cek Transaksi (Looping System)**
   Bot tidak memaksa user menunggu. Transaksi berjalan di belakang layar. Setiap 30 detik, bot akan mengecek status pesanan ke Digiflazz secara diam-diam.
   - Jika *SUKSES*, bot otomatis mencetak **Gambar Struk (Invoice)** dan mengirimkannya ke user.
   - Jika *GAGAL*, bot akan mengembalikan saldo (*Auto-Refund*) dan memberitahu user alasan kegagalannya (misal: "Stok Kosong").

2. **Laporan Transaksi ke Owner (PC)**
   Setiap ada transaksi yang Selesai, bot akan melakukan "Japri" (PC) ke nomor Owner.
   - **Laporan Sukses:** Menyertakan informasi lengkap User, Tujuan, Harga Modal, Harga Jual, hingga **Total Profit**!
   - **Laporan Gagal:** Menyertakan informasi kenapa gagal dari pusat, sehingga Owner tidak perlu membuka dashboard Digiflazz untuk mencari tahu.

3. **Pencatat Otomatis ke Google Sheets (GSheets)**
   Tidak ada lagi rekap manual! Setiap transaksi akan langsung dicatat oleh bot ke Google Sheets Anda secara rapi. Data yang masuk mencakup: *Waktu, Role, Produk, Target, Modal, Harga Jual, Profit, dan SN*. Semua sudah terenkripsi dengan aman melalui *Google Apps Script*.

4. **Ekstraktor Nickname Game (AI-Based)**
   Beberapa game di Digiflazz mengembalikan nama pengguna yang menyatu dengan Serial Number (SN) (Misalnya: `Nama Akun / 12345678`). Bot ini akan mendeteksi dan secara ajaib mengekstrak nama tersebut agar tampil rapi di bagian *Nickname* pada Struk Invoice.

5. **Auto-Sync Produk Digiflazz**
   Setiap 12 jam, bot akan menyalin seluruh harga dan daftar produk terbaru dari Digiflazz ke *database lokal* bot. Owner tidak perlu meng-update harga satu-persatu! (Bisa dipaksa manual dengan perintah `.updateprice`).

---

## 🛠️ Cara Instalasi
1.  **Clone / Download** repository ini.
2.  Buka terminal di folder project, lalu instal dependensi:
    ```bash
    npm install
    ```
3.  Konfigurasi bot di file `config/config.js` (Isi API Key Digiflazz, Nomor Owner, dll).
4.  Jalankan bot:
    ```bash
    npm start
    ```
5.  Pilih metode login (**QR Code** atau **Pairing Code**).

*(Lihat `TUTORIAL.md` untuk cara pasang di Panel Pterodactyl dan integrasi Google Sheets).*

---

## 📁 Struktur Folder Utama
```text
├── Assets/           # Template gambar (Invoice, dll)
├── commands/         # File perintah modular (.buy, .link, .menu, dll)
├── config/           # File konfigurasi bot & API
├── database/         # Penyimpanan data JSON (Users, Settings, Transactions)
├── lib/              # Library inti (DB Handler, Invoice, Welcome, Digiflazz)
├── session/          # Data login WhatsApp
├── temp/             # Folder penyimpanan sementara (Invoice yang baru dibuat)
├── index.js          # Entry point aplikasi
└── message.js        # Handler logika pesan
```

---

## 📄 Lisensi
Script ini dikembangkan untuk tujuan bisnis top-up. Dilarang keras menyebarluaskan kembali tanpa izin pengembang.

**YT: FENNIK SENPAI**
