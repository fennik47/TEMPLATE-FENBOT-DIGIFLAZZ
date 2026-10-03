const fs = require('fs-extra');
const path = require('path');
const db = require('../lib/db');
const arbakti = require('../lib/arbakti');

module.exports = {
    name: "setapp",
    aliases: ["setidapp", "setidaplikasi", "setappqris", "setqrisapp"],
    run: async (sock, m, { args, isOwner, config }) => {
        if (!isOwner) return sock.reply(m.chat, "❌ Perintah ini khusus untuk Owner bot!", m);

        if (!args || args.length < 1) {
            const currentAppId = arbakti.appId || '(belum diatur)';
            let text = `📱 *PENGATURAN ID APLIKASI QRIS (ARBAKTI)*\n\n`;
            text += `• ID Aplikasi Saat Ini: *${currentAppId}*\n\n`;
            text += `💡 *Fungsi ID Aplikasi:*\n`;
            text += `Satu API Key Arbakti dapat digunakan untuk banyak user / bot WhatsApp yang berbeda. Setiap bot dibedakan berdasarkan *ID Aplikasi* (Pattern Notifikasi di dashboard Arbakti).\n\n`;
            text += `📌 *Cara Penggunaan:*\n`;
            text += `\`.setapp [id_aplikasi]\`\n\n`;
            text += `*Contoh:*\n`;
            text += `\`.setapp kris\`\n`;
            text += `\`.setapp qrispoetry\`\n\n`;
            text += `_Lihat ID Aplikasi akun Anda di: https://payment.arbakti.monster/member/pattern-notifikasi atau ketik *.cekarbakti*._`;
            return sock.reply(m.chat, text, m);
        }

        const newAppId = args[0].trim();

        // 1. Simpan ke database / settings
        db.updateSettings({
            arbakti_app_id: newAppId,
            arbakti_method: newAppId
        });

        // 2. Simpan ke database/settings.json
        const settingsFile = path.join(__dirname, '..', 'database', 'settings.json');
        try {
            const currentSettings = fs.existsSync(settingsFile) ? fs.readJsonSync(settingsFile) : {};
            currentSettings.arbakti_app_id = newAppId;
            currentSettings.arbakti_method = newAppId;
            fs.writeJsonSync(settingsFile, currentSettings, { spaces: 2 });
        } catch (e) {
            console.error('[ SETAPP ] Gagal simpan ke settings.json:', e.message);
        }

        // 3. Update runtime
        arbakti.appId = newAppId;
        if (!config.arbakti) config.arbakti = {};
        config.arbakti.appId = newAppId;
        config.arbakti.method = newAppId;

        // 4. Validasi ke Arbakti jika API Key tersedia
        let validationNote = '';
        if (arbakti.apiKey) {
            try {
                const listRes = await arbakti.getPaymentList(true);
                if (listRes.success && listRes.data) {
                    const qrisList = Array.isArray(listRes.data.QRIS) ? listRes.data.QRIS : (listRes.data.QRIS ? [listRes.data.QRIS] : []);
                    const matched = qrisList.find(q => q.id === newAppId);
                    if (matched) {
                        validationNote = `\n🟢 *Terverifikasi di akun Arbakti:*\n• Nama Aplikasi : *${matched.name || matched.id}*\n• Fee           : ${matched.feeType === 'percent' ? matched.fee + '%' : 'Rp' + matched.fee}`;
                    } else if (qrisList.length > 0) {
                        const availableIds = qrisList.map(q => `\`${q.id}\` (${q.name || '-'})`).join(', ');
                        validationNote = `\n⚠️ *Perhatian:* ID Aplikasi \`${newAppId}\` belum terdaftar di akun Arbakti Anda.\nID yang terdaftar saat ini: ${availableIds}`;
                    }
                }
            } catch {}
        }

        let replyText = `✅ *ID APLIKASI QRIS BERHASIL DIATUR!*\n\n`;
        replyText += `• ID Aplikasi : *${newAppId}*\n`;
        replyText += `• Status      : ✅ Aktif digunakan bot ini\n`;
        replyText += validationNote;
        replyText += `\n\nSetiap transaksi *.deposit* dan *.buyqris* kini akan otomatis membuat tagihan QRIS untuk aplikasi *${newAppId}*! 🚀`;

        await sock.reply(m.chat, replyText, m);
    }
};
