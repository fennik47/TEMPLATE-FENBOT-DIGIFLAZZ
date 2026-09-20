# 📘 Panduan Penggunaan Bot WA Digiflazz V.1

Selamat! Anda telah memiliki script bot top-up paling canggih saat ini. Berikut adalah panduan komprehensif cara mengoperasikannya.

---

##  1. Cara Menghubungkan Saldo & Mengisi Saldo (Fitur LID Baru!)
WhatsApp kini menggunakan ID Anonim (`@lid`) untuk melindungi privasi member di dalam grup. Bot ini sudah dilengkapi teknologi tercanggih untuk membaca ID tersebut secara otomatis!

**Cara Mengisi Saldo Member di Grup:**
Kini Anda **tidak perlu lagi** mengetik nomor panjang yang rumit. Cukup *reply* (balas) pesan member di grup, atau *tag* member tersebut, lalu gunakan perintah:
- `.addsaldo @tag 50000` (Untuk menambah 50.000)
- `.minsaldo @tag 10000` (Untuk mengurangi 10.000)

Sistem bot akan otomatis melacak ID Anonim mereka dan menyesuaikan saldonya, baik saat mereka chatting di grup maupun di private chat!

---

##  2. Integrasi Riwayat Transaksi ke Google Sheets
Bot ini mencatat seluruh transaksi sukses maupun gagal secara otomatis ke Google Sheets Anda dengan sangat detail (Role, Modal, Profit, dll).

**Cara Pemasangan GSheets:**
1. Buka Google Sheets baru. Buat header di baris pertama (A1 sampai K1) persis seperti ini (Gunakan Huruf Kapital):
   `ID TRANSAKSI` | `WAKTU` | `USER` | `ROLE` | `PRODUK` | `TARGET` | `MODAL` | `HARGA JUAL` | `PROFIT` | `SN` | `STATUS`
2. Klik **Ekstensi > Apps Script**. Hapus semua kode bawaan, lalu *paste* kode pintar ini:
   ```javascript
   function doPost(e) {
     var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
     var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
     var body = {};
     try { body = JSON.parse(e.postData.contents); } catch(err) { body = e.parameter; }
     
     var newRow = [];
     for (var i = 0; i < headers.length; i++) {
       var header = headers[i].toString().trim();
       if (header !== "") {
         newRow.push(body[header] !== undefined ? body[header] : "");
       } else { newRow.push(""); }
     }
     sheet.appendRow(newRow);
     return ContentService.createTextOutput(JSON.stringify({status: "success"}))
       .setMimeType(ContentService.MimeType.JSON);
   }
   ```
3. Simpan dan klik **Terapkan (Deploy) > Kelola Penerapan > Versi Baru**. Pilih opsi Web App. Akses siapa saja (Anyone).
4. Salin URL yang diberikan, lalu *paste* URL tersebut ke dalam file `database/settings.json` di bagian `"gsheetUrl"`.
5. Restart bot. Transaksi selanjutnya akan langsung tercatat otomatis ke GSheet dengan sangat rapi!

---

##  3. Tutorial Instalasi Bot di Panel Pterodactyl
Untuk menjaga bot hidup 24 jam nonstop tanpa perlu menyalakan komputer, Anda sangat disarankan untuk meng-hosting bot di Panel Pterodactyl.

**Langkah-langkah di Pterodactyl:**
1. **Beli/Siapkan Server Pterodactyl:** Pastikan Anda memilih server NodeJS (Minimal versi NodeJS 18 atau 20+).
2. **Upload Script (SC):**
   - Jadikan seluruh folder script bot (termasuk `package.json`, `config`, dsb.) ke dalam format **.zip**.
   - Masuk ke tab **Files** di panel Pterodactyl.
   - Klik **Upload** dan pilih file `.zip` tadi.
   - Setelah terupload, klik kanan (atau titik tiga) pada file `.zip` tersebut dan pilih **Unarchive**.
3. **Instal Modul (NPM Install):**
   - Buka tab **Console**.
   - Ketikkan perintah `npm install` lalu tekan Enter.
   - Tunggu hingga proses instalasi library selesai. Jika ada *warning* warna kuning, abaikan saja.
4. **Jalankan Bot:**
   - Masuk ke tab **Startup**. Pastikan file eksekusi (Startup Command) adalah `node index.js`.
   - Kembali ke tab **Console**, klik tombol **Start**.
   - Bot akan menyala! Pilih login menggunakan **Pairing Code** (ketik `2`).
   - Masukkan nomor bot Anda, lalu masukkan kode yang muncul ke aplikasi WhatsApp Anda (di menu *Tautkan Perangkat / Linked Devices*).
   - Selamat, bot sudah online 24/7 di panel Anda!

---

##  4. Tugas Owner/Admin Lainnya
- **Ubah Role User:** `.setrole @tag GOLD`
- **Tarik Produk Baru:** Bot otomatis tarik data Digiflazz setiap 12 jam. Anda bisa paksa tarik manual dengan `.updateprice`.
- **Backup Data:** Ketik `.backup`. Bot akan membungkus seluruh data Anda ke dalam ZIP dan mengirimkannya via WA. Sangat penting jika Anda ingin memindahkan bot.

---
**Salam**
*Script Bot WA Digiflazz by fenniksenpai*
