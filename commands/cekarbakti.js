const arbakti = require('../lib/arbakti');

module.exports = {
    name: "cekarbakti",
    aliases: ["listpayment", "arbaktistatus", "cekpayment", "qrislist"],
    run: async (sock, m, { isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, "❌ Perintah ini khusus untuk Owner bot!", m);

        if (!arbakti.apiKey) {
            return sock.reply(m.chat, `⚠️ *API KEY ARBAKTI BELUM DIATUR*\n\nSilakan atur API Key Arbakti Anda terlebih dahulu dengan perintah:\n\`.setarbakti [api_key]\`\n\n_Dapatkan API Key di halaman Profil https://payment.arbakti.monster_`, m);
        }

        await sock.reply(m.chat, `⏳ Memeriksa status koneksi dan metode pembayaran di Arbakti...`, m);

        const listRes = await arbakti.getPaymentList(true);

        if (!listRes.success || !listRes.data) {
            let errMsg = listRes.message || 'Gagal terhubung ke Arbakti.';
            return sock.reply(m.chat, `❌ *GAGAL MENGHUBUNGI ARBAKTI*\n\n${errMsg}\n\nPastikan API Key sudah sesuai.`, m);
        }

        const data = listRes.data;
        const rawKey = arbakti.apiKey;
        const maskedKey = rawKey.length > 7 ? (rawKey.slice(0, 4) + '****' + rawKey.slice(-4)) : '****';
        const preferred = arbakti.preferredMethod || '(Otomatis)';

        let text = `📊 *STATUS GATEWAY PEMBAYARAN ARBAKTI*\n\n`;
        text += `• API Key     : *${maskedKey}*\n`;
        text += `• Preferensi  : *${preferred}*\n`;
        text += `• Gateway URL : *https://payment.arbakti.monster*\n`;
        text += `• Status      : 🟢 *Terhubung (Aktif)*\n\n`;

        // QRIS
        text += `📱 *METODE QRIS:*\n`;
        const qrisList = Array.isArray(data.QRIS) ? data.QRIS : (data.QRIS ? [data.QRIS] : []);
        if (qrisList.length > 0) {
            qrisList.forEach((q, idx) => {
                const feeText = q.feeType === 'percent' ? `${q.fee}%` : `Rp${Number(q.fee).toLocaleString()}`;
                const minText = q.minAmount ? `Rp${Number(q.minAmount).toLocaleString()}` : '-';
                const maxText = q.maxAmount ? `Rp${Number(q.maxAmount).toLocaleString()}` : '-';
                text += `  ${idx + 1}. *${q.name || 'QRIS Dinamis'}* (ID: \`${q.id}\`)\n`;
                text += `     • Fee: ${feeText} | Min: ${minText} | Max: ${maxText}\n`;
                if (q.qrisName) text += `     • Merchant: ${q.qrisName}\n`;
            });
        } else {
            text += `  ❌ *Belum ada metode QRIS yang aktif!*\n`;
            text += `  👉 _Silakan login ke https://payment.arbakti.monster lalu masuk ke menu "Metode Pembayaran" dan aktifkan/tambahkan metode QRIS._\n`;
        }
        text += `\n`;

        // E-Wallet
        const ewalletList = Array.isArray(data.Ewallet) ? data.Ewallet : (data.Ewallet ? [data.Ewallet] : []);
        if (ewalletList.length > 0) {
            text += `💳 *METODE E-WALLET:*\n`;
            ewalletList.forEach((e, idx) => {
                text += `  ${idx + 1}. *${e.name || e.id}* (ID: \`${e.id}\`)\n`;
                if (e.accountNumber) text += `     • Rek: ${e.accountNumber} a.n ${e.accountName || '-'}\n`;
            });
            text += `\n`;
        }

        // Bank
        const bankList = Array.isArray(data.Bank) ? data.Bank : (data.Bank ? [data.Bank] : []);
        if (bankList.length > 0) {
            text += `🏦 *METODE TRANSFER BANK:*\n`;
            bankList.forEach((b, idx) => {
                text += `  ${idx + 1}. *${b.name || b.id}* (ID: \`${b.id}\`)\n`;
                if (b.accountNumber) text += `     • Rek: ${b.accountNumber} a.n ${b.accountName || '-'}\n`;
            });
            text += `\n`;
        }

        if (qrisList.length > 0) {
            text += `✅ *Fitur Deposit QRIS (.deposit) & Pembelian QRIS (.buyqris) siap digunakan!*`;
        } else {
            text += `⚠️ *PERINGATAN:* Transaksi QRIS otomatis belum dapat digunakan sampai Anda mengaktifkan metode QRIS di dashboard https://payment.arbakti.monster!`;
        }

        return sock.reply(m.chat, text, m);
    }
};
