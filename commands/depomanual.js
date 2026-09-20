const fs = require('fs-extra');
const path = require('path');

module.exports = {
    name: "deposit",
    aliases: ["depo", "isi-saldo"],
    run: async (sock, m, { args }) => {
        if (!args || args.length === 0) {
            return sock.reply(m.chat, `💡 *CARA DEPOSIT SALDO*\n\n1. Ketik *.deposit [nominal]*\nContoh: \`.deposit 50000\`\n2. Transfer ke rekening/QRIS yang muncul.\n3. Kirim bukti transfer (gambar) dan beri caption *.konfirmasi*`, m);
        }

        const amount = parseInt(args[0].replace(/[^0-9]/g, ''));
        if (isNaN(amount) || amount < 1000) return sock.reply(m.chat, "❌ Nominal minimal Rp1.000!", m);

        const dbPath = path.join(__dirname, '..', 'config', 'payment.json');
        if (!fs.existsSync(dbPath)) return sock.reply(m.chat, 'Data pembayaran belum diatur oleh admin.', m);

        const dbPayment = await fs.readJson(dbPath);

        let text = `📑 *REQUEST DEPOSIT MANUAL*\n\n`;
        text += `• Nominal: *Rp${amount.toLocaleString()}*\n`;
        text += `• Status: *Menunggu Pembayaran*\n\n`;
        text += `💳 *METODE PEMBAYARAN:*\n`;

        if (dbPayment.rekening.length === 0) {
            text += `- Belum ada data rekening.\n`;
        } else {
            dbPayment.rekening.forEach((r, i) => {
                text += `- ${r.bank}: ${r.nomor} (a/n ${r.nama})\n`;
            });
        }

        text += `\n📌 *PENTING:* Setelah transfer, silakan kirim foto bukti transfer dengan caption: \`.konfirmasi ${amount}\``;

        if (dbPayment.qris && fs.existsSync(dbPayment.qris)) {
            await sock.sendMessage(m.chat, {
                image: { url: dbPayment.qris },
                caption: text
            }, { quoted: m });
        } else {
            await sock.reply(m.chat, text, m);
        }
    }
};
