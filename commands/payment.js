const fs = require('fs-extra');
const path = require('path');

module.exports = {
    name: "payment",
    aliases: ["bayar", "pay"],
    run: async (sock, m) => {
        const dbPath = path.join(__dirname, '..', 'config', 'payment.json');
        if (!fs.existsSync(dbPath)) return sock.reply(m.chat, 'Data pembayaran belum diatur.', m);

        const db = await fs.readJson(dbPath);

        let text = `╭─「 PAYMENT 」\n`;
        if (db.rekening.length === 0) {
            text += `│ Belum ada data rekening.\n`;
        } else {
            db.rekening.forEach((r, i) => {
                text += `│ ${i + 1}. ${r.bank}: ${r.nomor} (a/n ${r.nama})\n`;
            });
        }
        text += `╰──────────\n\nSilakan transfer dan kirim bukti pembayaran ke Admin.`;

        if (db.qris && fs.existsSync(db.qris)) {
            await sock.sendMessage(m.chat, {
                image: { url: db.qris },
                caption: text
            }, { quoted: m });
        } else {
            await sock.reply(m.chat, text, m);
        }
    }
};
