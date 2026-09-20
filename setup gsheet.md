Berikut adalah panduan lengkap untuk setup Google Sheets Recap agar setiap transaksi sukses otomatis tercatat di Spreadsheet Anda:

Langkah 1: Siapkan Google Sheets
Buka Google Sheets.
Beri nama file (misal: Recap Bot Store).
Di baris pertama (Header), buat kolom berikut agar rapi:
ID TRANSAKSI, WAKTU, USER, ROLE, PRODUK, TARGET, MODAL, HARGA JUAL, PROFIT, SN, STATUS.
(Pastikan persis menggunakan huruf kapital agar terdeteksi oleh sistem).
Langkah 2: Pasang Google Apps Script
Di Google Sheets, klik menu Extensions > Apps Script.
Hapus semua kode yang ada di sana, lalu tempel kode berikut:
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
Langkah 3: Deploy sebagai Web App
Klik tombol Deploy (warna biru di kanan atas) > New Deployment.
Pilih type: Web App.
Isi deskripsi: Bot Recap.
Execute as: Me (Email Anda).
Who has access: Pilih Anyone (Ini penting agar bot bisa mengirim data).
Klik Deploy.
Copy Web App URL yang muncul (ujungnya ada tulisan /exec).
Langkah 4: Hubungkan ke Bot
Copy Web App URL yang muncul (ujungnya ada tulisan `/exec`).
Buka file `database/settings.json` di dalam folder script bot Anda.
Cari bagian `"gsheetUrl"`, lalu paste URL tersebut di dalamnya.
Contoh: `"gsheetUrl": "https://script.google.com/macros/s/XXX/exec"`
Simpan file tersebut dan **Restart Bot** (`node index.js`).
Cara Cek:
Setiap kali ada transaksi yang statusnya berubah menjadi Sukses di bot, data tersebut akan otomatis muncul di Google Sheets Anda secara real-time. Anda bisa menggunakan data ini untuk menghitung profit bulanan atau laporan ke supplier.

Apakah ada bagian yang kurang jelas?_