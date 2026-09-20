const db = require('../lib/db');

module.exports = {
    name: "setgsheet",
    aliases: ["gsheet"],
    run: async (sock, m, { args, isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, "❌ Khusus Owner!", m);

        if (!args || args.length === 0) {
            return sock.reply(m.chat, "❌ Masukkan URL Web App Google Apps Script!\nContoh: `.setgsheet https://script.google.com/macros/s/xxxx/exec`", m);
        }

        const url = args[0];
        if (!url.startsWith('https://script.google.com')) {
            return sock.reply(m.chat, "❌ URL tidak valid! Harus URL Google Apps Script Web App.", m);
        }

        db.updateSettings({ gsheetUrl: url });

        await sock.reply(m.chat, "✅ URL Google Sheets berhasil disimpan! Rekap transaksi sukses akan otomatis tercatat ke sana.", m);
    }
};
