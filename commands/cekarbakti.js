const arbakti = require('../lib/arbakti');

module.exports = {
    name: "cekarbakti",
    aliases: ["listpayment", "arbaktistatus", "cekpayment", "qrislist"],
    run: async (sock, m, { isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, "❌ Perintah ini khusus untuk Owner bot!", m);

        if (!arbakti.apiKey) {
            return sock.reply(m.chat, `⚠️ *API KEY ARBAKTI BELUM DIATUR*\n\nSilakan atur API Key Arbakti Anda terlebih dahulu dengan perintah:\n\`.setarbakti [api_key] [id_aplikasi]\`\n\n_Dapatkan API Key di halaman Profil https://payment.arbakti.monster_`, m);
        }

        await sock.reply(m.chat, `⏳ Memeriksa status koneksi dan daftar ID Aplikasi di Arbakti...`, m);

        const listRes = await arbakti.getPaymentList(true);

        if (!listRes.success || !listRes.data) {
            let errMsg = listRes.message || 'Gagal terhubung ke Arbakti.';
            return sock.reply(m.chat, `❌ *GAGAL MENGHUBUNGI ARBAKTI*\n\n${errMsg}\n\nPastikan API Key sudah sesuai.`, m);
        }

        const data = listRes.data;
        const rawKey = arbakti.apiKey;
        const maskedKey = rawKey.length > 7 ? (rawKey.slice(0, 4) + '****' + rawKey.slice(-4)) : '****';
        const currentAppId = arbakti.appId || '(Belum dipilih)';

        let text = `📊 *STATUS GATEWAY ARBAKTI (MULTI-APP)*\n\n`;
        text += `• API Key       : *${maskedKey}*\n`;
        text += `• ID App Aktif  : *${currentAppId}* ⚡\n`;
        text += `• Gateway URL   : *https://payment.arbakti.monster*\n`;
        text += `• Status        : 🟢 *Terhubung*\n\n`;

        // QRIS / Aplikasi
        text += `📱 *DAFTAR APLIKASI QRIS DI AKUN:* \n`;
        const qrisList = Array.isArray(data.QRIS) ? data.QRIS : (data.QRIS ? [data.QRIS] : []);
        if (qrisList.length > 0) {
            let matchedFound = false;
            qrisList.forEach((q, idx) => {
                const isSelected = q.id === currentAppId;
                if (isSelected) matchedFound = true;
                const feeText = q.feeType === 'percent' ? `${q.fee}%` : `Rp${Number(q.fee).toLocaleString()}`;
                const minText = q.minAmount ? `Rp${Number(q.minAmount).toLocaleString()}` : '-';
                const maxText = q.maxAmount ? `Rp${Number(q.maxAmount).toLocaleString()}` : '-';
                text += `  ${idx + 1}. *${q.name || q.id}* (ID: \`${q.id}\`)${isSelected ? ' 👈 *[DIGUNAKAN]*' : ''}\n`;
                text += `     • Fee: ${feeText} | Min: ${minText} | Max: ${maxText}\n`;
            });

            if (!matchedFound && currentAppId && currentAppId !== '(Belum dipilih)') {
                text += `\n⚠️ *Perhatian:* ID Aplikasi saat ini (\`${currentAppId}\`) tidak ditemukan di daftar aplikasi di atas! Gunakan salah satu ID di atas dengan perintah: \`.setapp [id]\`\n`;
            }
        } else {
            text += `  ❌ *Belum ada ID Aplikasi QRIS yang aktif!*\n`;
            text += `  👉 _Silakan login ke https://payment.arbakti.monster/member/pattern-notifikasi dan buat Pattern Notifikasi / ID Aplikasi baru._\n`;
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

        text += `💡 *Penggunaan Multi-User / Multi-Bot:*\n`;
        text += `Untuk mengarahkan bot ini ke ID Aplikasi tertentu, ketik:\n`;
        text += `👉 \`.setapp [id_aplikasi]\` (Contoh: \`.setapp kris\`)`;

        return sock.reply(m.chat, text, m);
    }
};
