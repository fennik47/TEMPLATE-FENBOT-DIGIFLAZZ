const fs = require('fs-extra');
const path = require('path');

module.exports = {
    name: "depomanual",
    aliases: ["manualdepo", "tfmanual", "bank"],
    run: async (sock, m, { args }) => {
        if (!args || args.length === 0) {
            return sock.reply(m.chat, `💡 *PANDUAN DEPOSIT MANUAL (TRANSFER BANK / E-WALLET)*\n\n` +
                `1. Ketik: *.depomanual [nominal]*\n` +
                `   Contoh: \`.depomanual 25000\`\n` +
                `2. Lakukan transfer sesuai nominal ke salah satu rekening / e-wallet Admin.\n` +
                `3. Kirim foto struk bukti transfer dengan caption:\n` +
                `   \`.konfirmasi [nominal]\`\n` +
                `4. Tunggu Admin memverifikasi mutasi dan menambahkan saldo Anda. ⏳\n\n` +
                `_Catatan: Minimal deposit manual Rp1.000._\n` +
                `_💡 Ingin saldo langsung masuk otomatis seketika? Gunakan *.deposit [nominal]* (QRIS Otomatis)._`, m);
        }

        const amount = parseInt(args[0].replace(/[^0-9]/g, ''));
        if (isNaN(amount) || amount < 1000) {
            return sock.reply(m.chat, "❌ Nominal deposit minimal Rp1.000!", m);
        }

        const dbPath = path.join(__dirname, '..', 'config', 'payment.json');
        if (!fs.existsSync(dbPath)) {
            return sock.reply(m.chat, '❌ Data rekening pembayaran belum diatur oleh admin.', m);
        }

        const dbPayment = await fs.readJson(dbPath);

        let text = `📑 *REQUEST DEPOSIT TRANSFER MANUAL*\n\n`;
        text += `• Nominal : *Rp${amount.toLocaleString()}*\n`;
        text += `• Metode  : *Transfer Bank / E-Wallet*\n`;
        text += `• Status  : ⏳ *Menunggu Transfer & Konfirmasi*\n\n`;
        text += `💳 *REKENING PEMBAYARAN ADMIN:*\n`;

        if (!dbPayment.rekening || dbPayment.rekening.length === 0) {
            text += `- Belum ada data rekening yang terdaftar. Hubungi Admin.\n`;
        } else {
            dbPayment.rekening.forEach((r, i) => {
                text += `  ${i + 1}. *${r.bank}*: \`${r.nomor}\` (a/n ${r.nama})\n`;
            });
        }

        text += `\n📌 *LANGKAH SELANJUTNYA:*\n`;
        text += `1. Transfer tepat *Rp${amount.toLocaleString()}* ke salah satu rekening di atas.\n`;
        text += `2. Simpan foto / struk bukti transfer Anda.\n`;
        text += `3. Kirim foto bukti tersebut dengan caption: \`.konfirmasi ${amount}\`\n`;
        text += `4. Admin akan memverifikasi mutasi dan menambah saldo ke akun Anda.\n\n`;
        text += `_💡 Butuh saldo langsung masuk detik ini juga? Gunakan *.deposit ${amount}* (QRIS Otomatis)._`;

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
