const fs = require('fs-extra');
const path = require('path');
const db = require('../lib/db');
const arbakti = require('../lib/arbakti');

module.exports = {
    name: "setarbakti",
    aliases: ["setqris", "setarbaktipay", "setmustika"],
    run: async (sock, m, { args, isOwner, config }) => {
        if (!isOwner) return sock.reply(m.chat, "❌ Perintah ini khusus untuk Owner bot!", m);

        if (!args || args.length < 1) {
            const rawKey = arbakti.apiKey || "";
            const currentKey = rawKey.length > 7
                ? (rawKey.slice(0, 4) + '****' + rawKey.slice(-4))
                : (rawKey ? '****' : '(belum diatur)');
            const preferred = arbakti.preferredMethod || '(Otomatis terdeteksi dari akun)';

            let text = `⚙️ *PENGATURAN ARBAKTI (QRIS OTOMATIS)*\n\n`;
            text += `• API Key   : *${currentKey}*\n`;
            text += `• Metode ID : *${preferred}*\n`;
            text += `• Gateway   : *https://payment.arbakti.monster*\n\n`;
            text += `💡 *Cara Pengisian:*\n`;
            text += `1. Simpan API Key:\n`;
            text += `   \`.setarbakti [api_key]\`\n\n`;
            text += `2. Simpan API Key beserta ID Metode:\n`;
            text += `   \`.setarbakti [api_key] [id_metode]\`\n\n`;
            text += `3. Cek status koneksi & metode aktif:\n`;
            text += `   \`.cekarbakti\`\n\n`;
            text += `*Contoh:*\n`;
            text += `\`.setarbakti sb_api_abcdef1234567890abcdef1234567890\`\n\n`;
            text += `_Catatan: Dapatkan API Key di menu Profil pada dashboard https://payment.arbakti.monster._`;
            return sock.reply(m.chat, text, m);
        }

        // Support syntax: .setarbakti method [method_id]
        if (args[0].toLowerCase() === 'method' && args[1]) {
            const chosenMethod = args[1].trim();
            db.updateSettings({ arbakti_method: chosenMethod });
            arbakti.preferredMethod = chosenMethod;
            if (!config.arbakti) config.arbakti = {};
            config.arbakti.method = chosenMethod;

            const settingsFile = path.join(__dirname, '..', 'database', 'settings.json');
            try {
                const currentSettings = fs.existsSync(settingsFile) ? fs.readJsonSync(settingsFile) : {};
                currentSettings.arbakti_method = chosenMethod;
                fs.writeJsonSync(settingsFile, currentSettings, { spaces: 2 });
            } catch {}

            return sock.reply(m.chat, `✅ *Metode QRIS Arbakti Diperbarui!*\n\nID Metode yang digunakan: *${chosenMethod}*`, m);
        }

        const apiKey = args[0].trim();
        const customMethod = args[1] ? args[1].trim() : '';

        // 1. Simpan ke database/settings
        const updatePayload = { arbakti_api_key: apiKey };
        if (customMethod) updatePayload.arbakti_method = customMethod;
        db.updateSettings(updatePayload);

        // 2. Simpan ke database/settings.json
        const settingsFile = path.join(__dirname, '..', 'database', 'settings.json');
        try {
            const currentSettings = fs.existsSync(settingsFile) ? fs.readJsonSync(settingsFile) : {};
            currentSettings.arbakti_api_key = apiKey;
            if (customMethod) currentSettings.arbakti_method = customMethod;
            fs.writeJsonSync(settingsFile, currentSettings, { spaces: 2 });
        } catch (e) {
            console.error('[ SETARBAKTI ] Gagal simpan ke settings.json:', e.message);
        }

        // 3. Update runtime client
        arbakti.apiKey = apiKey;
        if (customMethod) arbakti.preferredMethod = customMethod;
        if (!config.arbakti) config.arbakti = {};
        config.arbakti.apiKey = apiKey;
        if (customMethod) config.arbakti.method = customMethod;

        await sock.reply(m.chat, `⏳ Memvalidasi API Key ke server Arbakti...`, m);

        // 4. Test API Key ke endpoint /payment/list
        const testRes = await arbakti.getPaymentList(true);
        const masked = apiKey.length > 7
            ? (apiKey.slice(0, 4) + '****' + apiKey.slice(-4))
            : '****';

        if (!testRes.success || !testRes.data) {
            let warnMsg = `⚠️ *API KEY TERSIMPAN TETAPI GAGAL VALIDASI*\n\n`;
            warnMsg += `• API Key   : *${masked}*\n`;
            warnMsg += `• Keterangan: ${testRes.message || 'Gagal menghubungi Arbakti'}\n\n`;
            warnMsg += `_Pastikan API Key benar dan diambil dari menu Profil di https://payment.arbakti.monster._`;
            return sock.reply(m.chat, warnMsg, m);
        }

        const qrisList = Array.isArray(testRes.data.QRIS) ? testRes.data.QRIS : (testRes.data.QRIS ? [testRes.data.QRIS] : []);
        let replyText = `✅ *API KEY ARBAKTI BERHASIL DIHUBUNGKAN!*\n\n`;
        replyText += `• API Key   : *${masked}*\n`;
        replyText += `• Gateway   : *https://payment.arbakti.monster*\n`;

        if (qrisList.length > 0) {
            replyText += `• Metode QRIS: 🟢 *${qrisList.map(q => q.name || q.id).join(', ')}* (ID: \`${qrisList.map(q => q.id).join(', ')}\`)\n\n`;
            replyText += `Layanan QRIS otomatis (*.deposit* dan *.buyqris*) kini siap digunakan! 🚀\n`;
            replyText += `Ketik *.cekarbakti* untuk melihat rincian biaya & limit transaksi.`;
        } else {
            replyText += `\n⚠️ *PERHATIAN PENTING:*\n`;
            replyText += `API Key valid dan terhubung, tetapi *BELUM ADA metode pembayaran QRIS yang aktif* di akun Arbakti Anda!\n\n`;
            replyText += `👉 *Cara mengaktifkan QRIS di Arbakti:*\n`;
            replyText += `1. Buka dashboard *https://payment.arbakti.monster*\n`;
            replyText += `2. Masuk ke menu *Metode Pembayaran*\n`;
            replyText += `3. Aktifkan / Tambahkan metode pembayaran *QRIS*\n`;
            replyText += `4. Setelah aktif, bot akan langsung dapat menerima deposit QRIS otomatis tanpa restart! Ketik *.cekarbakti* untuk mengecek.`;
        }

        await sock.reply(m.chat, replyText, m);
    }
};
