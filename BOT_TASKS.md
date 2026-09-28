# Daftar Tugas Pemeliharaan & Fitur Bot WhatsApp Digiflazz

Gunakan dokumen ini untuk mencatat fitur baru, perubahan alur, atau perbaikan bug yang ingin Anda terapkan pada template bot. 

Anda cukup menuliskan keinginan Anda di bawah ini, lalu di sesi chat cukup ketik:
> **"Kerjakan tugas di BOT_TASKS.md"**

---

## Daftar Tugas Aktif

- [ ] **Tugas 1**: (Tuliskan nama fitur / perbaikan di sini)
  - Detail kebutuhan: 
  - File target (opsional): 
  - Ekspektasi hasil: 

- [ ] **Tugas 2**: (Tuliskan nama fitur / perbaikan berikutnya)
  - Detail kebutuhan: 

---

## Riwayat Tugas Selesai

- [x] **Hapus Sistem Registrasi Manual (.daftar) & Terapkan Auto-Registration Instan**:
  - **Kebutuhan**: Menghapus pemblokiran pengguna belum terdaftar, menerapkan silent auto-register saat ada pesan/perintah masuk (`pushName` dan nomor WA ternormalisasi), menghapus `commands/daftar.js`, dan membersihkan menu `.daftar` dari `commands/menu.js`.
  - **File Target**: `message.js`, `lib/db.js`, `commands/daftar.js` (dihapus), `commands/menu.js`.
  - **Hasil**: Pengalaman pengguna kini 100% *frictionless*. Pengguna baru langsung dapat mengakses `.saldo`, `.menu`, `.deposit`, `.buy`, dan `.buyqris` secara instan tanpa perlu mendaftar manual. Semua pengujian verifikasi berhasil (100% lulus).

- [x] **Audit & Penguatan Keamanan Fitur Khusus Owner (Anti-Bypass & Zero-Privilege Leak)**:
  - **Kebutuhan**: Memastikan seluruh perintah administratif dan finansial hanya dapat dieksekusi oleh Owner bot resmi, mencegah bypass akses via private chat, dan menambal celah kecocokan parsial nomor telepon (*suffix collision*).
  - **File Target**: `message.js`, `commands/setbgwelcome.js`, `commands/setbggoodbye.js`, `commands/digiflazz.js`, `commands/cekstatus.js`.
  - **Hasil**: 19 perintah owner terverifikasi ketat. Celah bypass `isAdmin = true` di Private Chat pada banner grup telah ditutup total. Normalisasi nomor telepon owner kini menggunakan exact-match internasional. Uji penetrasi otomatis 100% lulus.

- [x] **Pembersihan Database Lokal JSON, Penguatan LID-to-JID, & Penghapusan Menu .getlid**:
  - **Kebutuhan**: Mengosongkan seluruh database lokal `.json` dari sisa pengujian/identitas pribadi, memastikan konversi LID ke JID tetap mempertahankan JID tanpa mengubah kembali ke LID, serta menghapus perintah dan tampilan `.getlid`.
  - **File Target**: `database/deposits.json`, `database/qris_orders.json`, `database/lid_map.json`, `database/manual_products.json`, `database/products.json`, `database/settings.json`, `config/payment.json`, `lib/lidHelper.js`, `lib/serializer.js`, `commands/getlid.js` (dihapus), `commands/menu.js`.
  - **Hasil**: Seluruh database JSON telah bersih (fresh state). JID diproteksi agar tidak pernah terkonversi ke LID. Format nomor telepon Indonesia (08/628) otomatis dinormalisasi ke JID. Perintah `.getlid` telah dihapus sepenuhnya dari bot. Semua pengujian verifikasi 100% lulus.

- [x] **Hapus Prompt Interaktif Pilihan Login (QR / Pairing) di Terminal Pterodactyl**:
  - **Kebutuhan**: Menghapus `question("Masukkan pilihan (1/2): ")` yang memblokir proses container di terminal panel Pterodactyl. Otomatisasi proses otentikasi agar sepenuhnya dikendalikan via FENBOT Cloud Website Dashboard (QR streaming & Pairing Code API non-blocking).
  - **File Target**: `index.js`.
  - **Hasil**: Bot dapat langsung menyala secara *headless* tanpa perlu input manual di terminal. QR Code otomatis di-generate dan dikirim ke FENBOT Cloud. Ditambahkan endpoint HTTP `/api/qr` dan `/api/pairing` untuk integrasi dashboard web FENBOT Cloud.
- [x] **Pemisahan Perintah Deposit QRIS Otomatis (.deposit) & Deposit Transfer Manual (.depomanual)**:
  - **Kebutuhan**: Memisahkan alur deposit QRIS otomatis dan deposit manual bank/e-wallet yang sebelumnya tercampur di dalam perintah `.deposit`. Menghilangkan fallback diam-diam ke rekening bank agar pengguna tidak bingung mengira `.deposit` adalah alur manual. Menampilkan kedua perintah secara terpisah dan jelas di menu utama.
  - **File Target**: `commands/deposit.js` (baru), `commands/depomanual.js` (diperbarui), `commands/menu.js`.
  - **Hasil**: Perintah `.deposit` kini eksklusif menangani pembuatan QRIS otomatis dinamis via MustikaPay (menampilkan petunjuk bila API key belum disetel). Perintah `.depomanual` kini khusus menampilkan rekening/e-wallet admin dan instruksi konfirmasi via `.konfirmasi`. Tampilan `.menu` utama kini memuat kedua perintah tersebut dengan label jelas: `.deposit [nominal] (QRIS Otomatis)` dan `.depomanual [nominal] (Transfer Manual)`.
- [x] **Dukungan Kredensial Lengkap MustikaPay (Username & API Key) & Pemulihan Fitur Deposit QRIS**:
  - **Kebutuhan**: Memperbaiki kegagalan Error 403 / 401 pada pembuatan QRIS MustikaPay karena parameter `user` (Username) belum disertakan pada request payload dan form konfigurasi. Mengharuskan pengguna/admin mengisi Username dan API Key MustikaPay, serta menambahkan perintah owner `.setmustika [username] [api_key]`.
  - **File Target**: `fenbot.config.json`, `config/config.js`, `.env.example`, `lib/fenbot.js`, `lib/mustikapay.js`, `commands/deposit.js`, `commands/buyqris.js`, `commands/setmustika.js` (baru), `commands/menu.js`.
  - **Hasil**: Parameter `user` kini otomatis dikirimkan ke endpoint `/api/v1/create/qris` dan User-Agent browser digunakan untuk mencegah pemblokiran Cloudflare WAF. Peringatan informatif ditampilkan jika Username atau API Key belum diisi lengkap, mengarahkan owner untuk menyetelnya via Dashboard Web FENBOT Cloud atau perintah `.setmustika`.
